import { describe, expect, it } from 'vitest';
import { listingsPlausible, rawOnly, trendTrusted } from '../pipeline/build.ts';
import { actorInput } from '../pipeline/cardmarket.ts';

describe('trendTrusted', () => {
  it('trusts a trend between half and double the US raw price', () => {
    expect(trendTrusted(20, 20)).toBe(true);
    expect(trendTrusted(10, 20)).toBe(true);
    expect(trendTrusted(40, 20)).toBe(true);
    expect(trendTrusted(9.9, 20)).toBe(false);
    expect(trendTrusted(41, 20)).toBe(false);
    expect(trendTrusted(null, 20)).toBe(false);
  });
});

describe('listingsPlausible', () => {
  it('flags listings far from the US raw price as a likely wrong product', () => {
    expect(listingsPlausible(7, 576)).toBe(false);
    expect(listingsPlausible(500, 576)).toBe(true);
    expect(listingsPlausible(5, null)).toBe(true);
  });
});

describe('rawOnly', () => {
  it('drops slabs and damaged copies based on the seller comment', () => {
    const l = (price: number, comment: string | null) => ({ price, country: null, comment });
    const kept = rawOnly([l(1, null), l(2, 'PSA 9 slab'), l(3, 'mint, fast shipping'), l(4, 'Graded by CGC'), l(5, 'small crease')]);
    expect(kept.map((x) => x.price)).toEqual([1, 3]);
  });
});

describe('actorInput', () => {
  it('asks for Near Mint English, and 1st Edition when the card is one', () => {
    expect(actorInput('u', { variant: null })).toMatchObject({ productUrl: 'u', minCondition: 'NM', language: 'English' });
    expect(actorInput('u', { variant: '1st Edition' })).toMatchObject({ isFirstEd: true });
    expect(actorInput('u', { variant: null }, { sellerCountry: 'NL', maxPrice: 99.2 })).toMatchObject({ sellerCountry: 'NL', maxPrice: 100 });
  });
});

describe('scrapedNumberMatches', () => {
  it('checks the number the scraper read off the page', async () => {
    const { scrapedNumberMatches } = await import('../pipeline/build.ts');
    expect(scrapedNumberMatches('Lugia V SIT #138', '138')).toBe(true);
    expect(scrapedNumberMatches('Vaporeon SKH #31', 'H31')).toBe(true);
    expect(scrapedNumberMatches('Rayquaza VMAX SIT #TG29', 'TG29')).toBe(true);
    expect(scrapedNumberMatches('Mew ex SVP #053', '53')).toBe(true);
    expect(scrapedNumberMatches('Mewtwo GX SLG #39', '78')).toBe(false);
    expect(scrapedNumberMatches('Blastoise', '2')).toBe(true);
    expect(scrapedNumberMatches(null, '2')).toBe(true);
  });
});
