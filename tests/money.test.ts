import { describe, expect, it } from 'vitest';
import type { Card } from '../shared/schema.ts';
import { analyze, bucketOf, matchesQuery, sortRows, toEur, type Row } from '../src/lib/money.ts';
import { eur, signedEur, times } from '../src/lib/format.ts';

// Test fixtures only. These are not market prices.
type Listings = NonNullable<NonNullable<Card['cm']>['listings']>;
function listings(avg10: number, over: Partial<Listings> = {}): NonNullable<Card['cm']> {
  return { idProduct: 1, guide: null, listings: { avg10, median: avg10, min: avg10 * 0.8, max: avg10 * 1.2, n: 10, nl: null, nlChecked: true, fetchedAt: '2026-10-16T00:00:00Z', ...over } };
}
function card(over: Partial<Card> & { id: string }): Card {
  return {
    name: 'Test Card',
    set: 'Test Set',
    number: '1',
    variant: null,
    image: null,
    salesPerYear: 100,
    links: { pricecharting: 'https://www.pricecharting.com/game/x/y', cardmarket: 'https://www.cardmarket.com/en/Pokemon/Products?idProduct=1' },
    usd: { raw: 10, g8: 20, g9: 40, psa10: 100 },
    cm: listings(10),
    ...over,
  };
}

const FX = 0.5; // round number keeps the arithmetic readable
const FEE_USD = 20; // → €10

describe('toEur', () => {
  it('converts and passes null through', () => {
    expect(toEur(10, FX)).toBe(5);
    expect(toEur(null, FX)).toBeNull();
  });
});

describe('analyze', () => {
  it('computes net profit per grade after the fee', () => {
    const a = analyze(card({ id: 'a' }), FX, FEE_USD);
    expect(a.fee).toBe(10);
    expect(a.raw).toBe(10);
    expect(a.g8).toBe(10);
    expect(a.g9).toBe(20);
    expect(a.psa10).toBe(50);
    expect(a.net8).toBe(-10); // 10 − 10 − 10
    expect(a.net9).toBe(0); // 20 − 10 − 10
    expect(a.net10).toBe(30); // 50 − 10 − 10
  });

  it('max buy is the graded price minus the fee', () => {
    const a = analyze(card({ id: 'a' }), FX, FEE_USD);
    expect(a.maxBuy9).toBe(10);
    expect(a.maxBuy10).toBe(40);
  });

  it('a PSA 9 that only breaks even is not "safe"', () => {
    expect(analyze(card({ id: 'a' }), FX, FEE_USD).nineSafe).toBe(false);
    const b = card({ id: 'b', usd: { raw: 10, g8: 20, g9: 60, psa10: 100 } });
    expect(analyze(b, FX, FEE_USD).nineSafe).toBe(true);
  });

  it('multiplier is PSA 10 over the Cardmarket baseline', () => {
    expect(analyze(card({ id: 'a' }), FX, FEE_USD).multiplier).toBe(5);
  });

  it('handles a missing PSA 8 without breaking the other grades', () => {
    const a = analyze(card({ id: 'a', usd: { raw: 10, g8: null, g9: 40, psa10: 100 } }), FX, FEE_USD);
    expect(a.g8).toBeNull();
    expect(a.net8).toBeNull();
    expect(a.net10).toBe(30);
  });

  it('leaves profit empty when there is no Cardmarket price', () => {
    const a = analyze(card({ id: 'a', cm: null }), FX, FEE_USD);
    expect(a.raw).toBeNull();
    expect(a.net10).toBeNull();
    expect(a.multiplier).toBeNull();
    expect(a.bucket).toBeNull();
    // Max buy needs no raw price, so it still shows.
    expect(a.maxBuy9).toBe(10);
  });

  it('uses fewer than 10 listings when that is all there is', () => {
    const c = card({ id: 'a', cm: listings(30, { n: 4 }) });
    expect(analyze(c, FX, FEE_USD).raw).toBe(30);
  });

  it('shows the NL average only with at least 3 NL listings', () => {
    const withNl = (n: number): Card => card({ id: 'a', cm: listings(10, { nl: { avg: 11, n } }) });
    expect(analyze(withNl(2), FX, FEE_USD).nl).toBeNull();
    expect(analyze(withNl(3), FX, FEE_USD).nl).toEqual({ avg: 11, n: 3 });
  });
});

describe('raw baseline source', () => {
  const guide = (trusted: boolean) => ({ trend: 30, low: 5, avg30: 28, trusted });
  it('prefers the 10 cheapest NM English listings', () => {
    const a = analyze(card({ id: 'a', cm: { ...listings(12), guide: guide(true) } }), FX, FEE_USD);
    expect(a.raw).toBe(12);
    expect(a.rawSource).toBe('listings');
  });
  it('falls back to a trusted Cardmarket trend', () => {
    const a = analyze(card({ id: 'a', cm: { idProduct: 1, guide: guide(true), listings: null } }), FX, FEE_USD);
    expect(a.raw).toBe(30);
    expect(a.rawSource).toBe('trend');
  });
  it('ignores an untrusted trend', () => {
    const a = analyze(card({ id: 'a', cm: { idProduct: 1, guide: guide(false), listings: null } }), FX, FEE_USD);
    expect(a.raw).toBeNull();
    expect(a.rawSource).toBeNull();
    expect(a.net10).toBeNull();
  });
});

describe('bucketOf', () => {
  it('puts edges in the higher bucket', () => {
    expect(bucketOf(0)).toBe('u10');
    expect(bucketOf(9.99)).toBe('u10');
    expect(bucketOf(10)).toBe('10-25');
    expect(bucketOf(249.99)).toBe('100-250');
    expect(bucketOf(250)).toBe('250+');
    expect(bucketOf(12000)).toBe('250+');
  });
  it('returns null for missing or invalid prices', () => {
    expect(bucketOf(null)).toBeNull();
    expect(bucketOf(Number.NaN)).toBeNull();
    expect(bucketOf(-1)).toBeNull();
  });
});

describe('sortRows', () => {
  const rows: Row[] = [
    card({ id: 'cheap', name: 'A', cm: listings(5) }),
    card({ id: 'mid', name: 'B' }),
    card({ id: 'none', name: 'C', cm: null }),
  ].map((c) => ({ card: c, a: analyze(c, FX, FEE_USD) }));

  it('profit: highest first, missing last', () => {
    expect(sortRows(rows, 'profit').map((r) => r.card.id)).toEqual(['cheap', 'mid', 'none']);
  });
  it('cheapest: lowest raw first, missing last', () => {
    expect(sortRows(rows, 'cheapest').map((r) => r.card.id)).toEqual(['cheap', 'mid', 'none']);
  });
  it('does not mutate the input', () => {
    const before = rows.map((r) => r.card.id);
    sortRows(rows, 'multiplier');
    expect(rows.map((r) => r.card.id)).toEqual(before);
  });
});

describe('matchesQuery', () => {
  const c = card({ id: 'x', name: 'Umbreon VMAX', set: 'Evolving Skies', number: '215' });
  it('matches every word across name, set and number, ignoring case', () => {
    expect(matchesQuery(c, 'umbreon')).toBe(true);
    expect(matchesQuery(c, 'UMBREON skies')).toBe(true);
    expect(matchesQuery(c, '215')).toBe(true);
    expect(matchesQuery(c, 'umbreon 214')).toBe(false);
    expect(matchesQuery(c, '  ')).toBe(true);
  });
  it('ignores accents', () => {
    expect(matchesQuery(card({ id: 'y', name: 'Pokémon Center Pikachu' }), 'pokemon')).toBe(true);
  });
});

describe('format', () => {
  it('formats euros for small and large amounts', () => {
    expect(eur(12.4)).toBe('€12.40');
    expect(eur(125.4)).toBe('€125');
    expect(eur(null)).toBe('—');
  });
  it('signs profits with a real minus', () => {
    expect(signedEur(85)).toBe('+€85.00');
    expect(signedEur(-12.4)).toBe('−€12.40');
  });
  it('formats multipliers', () => {
    expect(times(3.456)).toBe('3.5×');
    expect(times(12.6)).toBe('13×');
  });
});
