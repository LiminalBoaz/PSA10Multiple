import { describe, expect, it } from 'vitest';
import type { Card } from '../shared/schema.ts';
import { analyze, bucketOf, matchesQuery, sortRows, toEur, toggleBucket, visibleRows, type BucketId, type Row } from '../src/lib/money.ts';
import { eur, signedEur, times } from '../src/lib/format.ts';
import { parseEuroInput } from '../src/lib/parse.ts';

// Test fixtures only. These are not market prices.
type Listings = NonNullable<NonNullable<Card['cm']>['listings']>;
function listings(avg10: number, over: Partial<Listings> = {}): NonNullable<Card['cm']> {
  return {
    idProduct: 1,
    checkedAt: '2026-10-16T00:00:00Z',
    guide: null,
    listings: { avg10, median: avg10, min: avg10 * 0.8, max: avg10 * 1.2, n: 10, nl: null, nlChecked: true, fetchedAt: '2026-10-16T00:00:00Z', ...over },
  };
}
function card(over: Partial<Card> & { id: string }): Card {
  return {
    name: 'Test Card',
    set: 'Test Set',
    number: '1',
    variant: null,
    image: null,
    added: false,
    salesPerYear: 100,
    links: { pricecharting: 'https://www.pricecharting.com/game/x/y', cardmarket: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/X/Y' },
    usd: { raw: 10, g8: 20, g9: 40, psa10: 100 },
    cm: listings(10),
    cmNote: null,
    ...over,
  };
}

const FX = 0.5; // round numbers keep the arithmetic readable
const FEE = 10; // euros

describe('analyze', () => {
  it('works out what you make per grade after the fee', () => {
    const a = analyze(card({ id: 'a' }), FX, FEE);
    expect([a.raw, a.g8, a.g9, a.psa10]).toEqual([10, 10, 20, 50]);
    expect([a.net8, a.net9, a.net10]).toEqual([-10, 0, 30]);
  });
  it('max buy is the grade 9 price minus the fee', () => {
    expect(analyze(card({ id: 'a' }), FX, FEE).maxBuy9).toBe(10);
  });
  it('a grade 9 that only breaks even is not "safe"', () => {
    expect(analyze(card({ id: 'a' }), FX, FEE).nineSafe).toBe(false);
    expect(analyze(card({ id: 'b', usd: { raw: 10, g8: 20, g9: 60, psa10: 100 } }), FX, FEE).nineSafe).toBe(true);
  });
  it('multiplier is PSA 10 over the raw price', () => {
    expect(analyze(card({ id: 'a' }), FX, FEE).multiplier).toBe(5);
  });
  it('handles a missing grade 8', () => {
    const a = analyze(card({ id: 'a', usd: { raw: 10, g8: null, g9: 40, psa10: 100 } }), FX, FEE);
    expect(a.net8).toBeNull();
    expect(a.net10).toBe(30);
  });
  it('leaves profit empty without a raw price', () => {
    const a = analyze(card({ id: 'a', cm: null }), FX, FEE);
    expect([a.raw, a.net10, a.multiplier, a.bucket]).toEqual([null, null, null, null]);
    expect(a.maxBuy9).toBe(10);
  });
  it('shows the NL average only with at least 3 NL listings', () => {
    const withNl = (n: number) => card({ id: 'a', cm: listings(10, { nl: { avg: 11, n } }) });
    expect(analyze(withNl(2), FX, FEE).nl).toBeNull();
    expect(analyze(withNl(3), FX, FEE).nl).toEqual({ avg: 11, n: 3 });
  });
});

describe('raw price source', () => {
  const guide = (trusted: boolean) => ({ trend: 30, low: 5, avg30: 28, trusted });
  it('your own price wins', () => {
    const a = analyze(card({ id: 'a' }), FX, FEE, 42);
    expect([a.raw, a.rawSource]).toEqual([42, 'mine']);
  });
  it('then the cheapest NM English listings', () => {
    const a = analyze(card({ id: 'a', cm: { ...listings(12), guide: guide(true) } }), FX, FEE);
    expect([a.raw, a.rawSource]).toEqual([12, 'listings']);
  });
  it('then a confirmed Cardmarket estimate', () => {
    const a = analyze(card({ id: 'a', cm: { idProduct: 1, checkedAt: null, guide: guide(true), listings: null } }), FX, FEE);
    expect([a.raw, a.rawSource]).toEqual([30, 'estimate']);
  });
  it('never an unconfirmed estimate', () => {
    const a = analyze(card({ id: 'a', cm: { idProduct: 1, checkedAt: null, guide: guide(false), listings: null } }), FX, FEE);
    expect([a.raw, a.rawSource]).toEqual([null, null]);
  });
});

describe('price slots', () => {
  it('match the agreed ranges, edges going up', () => {
    expect([0, 24.99, 49.99, 50, 99.99, 100, 250, 499.99, 500, 25000].map(bucketOf)).toEqual([
      '0-50', '0-50', '0-50', '50-100', '50-100', '100-250', '250-500', '250-500', '500+', '500+',
    ]);
    expect([null, Number.NaN, -1].map(bucketOf)).toEqual([null, null, null]);
  });
  it('select several; "All" clears', () => {
    let s = toggleBucket(new Set(), '0-50');
    s = toggleBucket(s, '500+');
    expect([...s].sort()).toEqual(['0-50', '500+']);
    expect([...toggleBucket(s, '0-50')]).toEqual(['500+']);
    expect(toggleBucket(s, 'all').size).toBe(0);
  });
});

describe('visibleRows', () => {
  const mk = (id: string, name: string, raw: number): Row => {
    const c = card({ id, name, cm: listings(raw) });
    return { card: c, a: analyze(c, FX, FEE) };
  };
  const rows = [mk('a', 'Pikachu', 10), mk('b', 'Charizard ex', 30), mk('c', 'Mewtwo GX', 600)];
  const sel = (...ids: BucketId[]) => new Set(ids);
  it('shows everything with nothing selected', () => expect(visibleRows(rows, '', sel()).length).toBe(3));
  it('combines selected slots', () => expect(visibleRows(rows, '', sel('0-50', '500+')).map((r) => r.card.id)).toEqual(['a', 'b', 'c']));
  it('one slot', () => expect(visibleRows(rows, '', sel('500+')).map((r) => r.card.id)).toEqual(['c']));
  it('search ignores the slots and looks at every card', () => expect(visibleRows(rows, 'mewtwo', sel('0-50')).map((r) => r.card.id)).toEqual(['c']));
});

describe('matchesQuery', () => {
  const c = card({ id: 'x', name: 'Umbreon VMAX', set: 'Evolving Skies', number: '215' });
  it('matches word starts across name, set and number', () => {
    expect(matchesQuery(c, 'umbreon')).toBe(true);
    expect(matchesQuery(c, 'UMB evol')).toBe(true);
    expect(matchesQuery(c, '215')).toBe(true);
    expect(matchesQuery(c, 'umbreon 214')).toBe(false);
    expect(matchesQuery(c, '  ')).toBe(true);
  });
  it('ignores accents and punctuation', () => {
    expect(matchesQuery(card({ id: 'y', name: 'Pokémon Center' }), 'pokemon')).toBe(true);
    expect(matchesQuery(card({ id: 'z', name: 'Gengar & Mimikyu GX' }), 'gengar mimikyu')).toBe(true);
    expect(matchesQuery(card({ id: 'w', name: "Misty's Psyduck" }), 'mistys')).toBe(true);
  });
});

describe('sortRows', () => {
  const rows: Row[] = [card({ id: 'cheap', name: 'A', cm: listings(5) }), card({ id: 'mid', name: 'B' }), card({ id: 'none', name: 'C', cm: null })].map((c) => ({
    card: c,
    a: analyze(c, FX, FEE),
  }));
  it('profit: highest first, missing last', () => expect(sortRows(rows, 'profit').map((r) => r.card.id)).toEqual(['cheap', 'mid', 'none']));
  it('cheapest: lowest first, missing last', () => expect(sortRows(rows, 'cheapest').map((r) => r.card.id)).toEqual(['cheap', 'mid', 'none']));
});

describe('parseEuroInput', () => {
  it('reads what people type on a phone', () => {
    expect(['12,50', '12.50', '€ 12,5', '1.234,50', '1,234.50', '45'].map(parseEuroInput)).toEqual([12.5, 12.5, 12.5, 1234.5, 1234.5, 45]);
    expect(['', 'abc', '0', '-5'].map(parseEuroInput)).toEqual([null, null, null, null]);
  });
});

describe('format', () => {
  it('formats money and multipliers', () => {
    expect([eur(12.4), eur(125.4), eur(null)]).toEqual(['€12.40', '€125', '—']);
    expect([signedEur(85), signedEur(-12.4)]).toEqual(['+€85.00', '−€12.40']);
    expect([times(3.456), times(12.6)]).toEqual(['3.5×', '13×']);
    expect(toEur(10, FX)).toBe(5);
  });
});
