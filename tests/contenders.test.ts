import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { idsFromImage, toContender } from '../pipeline/contenders.ts';
import { sameNumber, slug, splitVariant } from '../pipeline/lib/files.ts';
import { mismatch, parseProduct, parseSearch, rankRows, setMatches } from '../pipeline/pricecharting.ts';
import { guideFor } from '../pipeline/tcgdex.ts';

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');

describe('PokeViews rows', () => {
  it('reads TCGplayer and PriceCharting ids from image names', () => {
    expect(idsFromImage('https://x/img/800/450289.webp')).toEqual({ tcgplayerId: 450289, pricechartingId: null });
    expect(idsFromImage('https://x/img/800/pc_2252747.webp')).toEqual({ tcgplayerId: null, pricechartingId: 2252747 });
    expect(idsFromImage('https://x/img/800/8fcfa89dd6c2.webp')).toEqual({ tcgplayerId: null, pricechartingId: null });
    expect(idsFromImage('https://x/img/108589_200w.jpg').tcgplayerId).toBe(108589);
  });
  it('splits variants out of the name', () => {
    expect(splitVariant('Ditto (1st Edition)')).toEqual({ name: 'Ditto', variant: '1st Edition' });
    expect(splitVariant('Lugia V')).toEqual({ name: 'Lugia V', variant: null });
  });
  it('builds a contender with a stable id', () => {
    const c = toContender({
      card_name: 'Ho-Oh (Reverse Holo)', set_name: 'Skyridge', card_number: '149', series_name: 'E-Card',
      ungraded_price: 410.38, psa_10_price: 4550, annual_sales_volume: 4,
      image_url: 'https://storage.googleapis.com/pokeviews-prod/img/800/pc_2252747.webp', date: '2026-10-15',
    });
    expect(c.id).toBe('ho-oh-reverse-holo-skyridge-149');
    expect(c.variant).toBe('Reverse Holo');
    expect(c.pricechartingId).toBe(2252747);
  });
  it('treats "None" as no card number', () => {
    const c = toContender({
      card_name: 'Ancient Mew', set_name: 'Promo', card_number: 'None', series_name: 'Other',
      ungraded_price: 1, psa_10_price: 2, annual_sales_volume: null, image_url: null, date: 'x',
    });
    expect(c.number).toBeNull();
  });
});

describe('sameNumber', () => {
  it('ignores leading zeros and case', () => {
    expect(sameNumber('053', '53')).toBe(true);
    expect(sameNumber('TG05', 'tg5')).toBe(true);
    expect(sameNumber('GG10', 'GG1')).toBe(false);
    expect(sameNumber('138', '13')).toBe(false);
    expect(sameNumber(null, '1')).toBe(false);
  });
});

describe('PriceCharting parsing (saved page)', () => {
  it('reads the grade prices from a product page', () => {
    const p = parseProduct(fixture('pricecharting-lugia-v-138.html'))!;
    expect(p.usd).toEqual({ raw: 14.96, g8: 20, g9: 36.55, psa10: 229.02 });
    expect(p.title).toContain('Lugia V #138');
  });
  it('reads search results and ranks the plain printing first', () => {
    const rows = parseSearch(fixture('pricecharting-search-lugia.html'));
    expect(rows.map((r) => r.title)).toEqual(['Lugia V #138', 'Lugia V [Prize Pack] #138']);
    const c = toContender({
      card_name: 'Lugia V', set_name: 'Silver Tempest', card_number: '138', series_name: 'SWSH',
      ungraded_price: 14.56, psa_10_price: 229.02, annual_sales_volume: 730, image_url: null, date: 'x',
    });
    expect(rankRows([...rows].reverse(), c)[0]!.title).toBe('Lugia V #138');
  });
  it('scores how far prices are from PokeViews', () => {
    expect(mismatch({ raw: 10, g8: null, g9: null, psa10: 100 }, { raw: 10, psa10: 100, salesPerYear: 1, date: 'x' })).toBe(0);
    expect(mismatch({ raw: null, g8: null, g9: null, psa10: 100 }, { raw: 10, psa10: 100, salesPerYear: 1, date: 'x' })).toBe(0.5);
  });
  it('parsing a non-product page returns null', () => {
    expect(parseProduct('<html><body>nothing</body></html>')).toBeNull();
  });
});

describe('Cardmarket guide per variant', () => {
  const cm = { trend: 20, low: 5, avg30: 18, 'trend-holo': 40, 'low-holo': 10, 'avg30-holo': 35 };
  it('uses the normal fields by default', () => expect(guideFor(cm, null)).toEqual({ trend: 20, low: 5, avg30: 18 }));
  it('uses the holo fields for reverse holos', () => expect(guideFor(cm, 'Reverse Holo')).toEqual({ trend: 40, low: 10, avg30: 35 }));
  it('drops the guide for 1st Edition, which Cardmarket mixes with Unlimited', () => expect(guideFor(cm, '1st Edition')).toBeNull());
});

describe('slug', () => {
  it('makes stable ids', () => expect(slug('Pokémon Center Pikachu', '25')).toBe('pokemon-center-pikachu-25'));
});

describe('PriceCharting set check', () => {
  const entei = toContender({
    card_name: 'Entei (Gold Star)', set_name: 'Unseen Forces', card_number: '113', series_name: 'EX',
    ungraded_price: 1081.3, psa_10_price: 12349.28, annual_sales_volume: 24, image_url: null, date: 'x',
  });
  it('rejects a Japanese printing with similar prices', () => {
    expect(setMatches('Entei [Gold Star] #19 · Pokemon Japanese Golden Sky, Silvery Ocean', entei)).toBe(false);
  });
  it('accepts the right set', () => {
    expect(setMatches('Entei [Gold Star] #113 · Pokemon Unseen Forces', entei)).toBe(true);
  });
  it('accepts any promo set for "Promo"', () => {
    const promo = { ...entei, set: 'Promo' };
    expect(setMatches('Mew ex #53 · Pokemon Promo', promo)).toBe(true);
    expect(setMatches('Mew ex #53 · Pokemon 151', promo)).toBe(false);
  });
  it('handles "&" in set names', () => {
    expect(setMatches('Drowzee #210 · Pokemon Scarlet & Violet', { ...entei, set: 'Scarlet & Violet' })).toBe(true);
  });
});
