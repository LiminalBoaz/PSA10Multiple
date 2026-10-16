import { describe, expect, it } from 'vitest';
import { listingsPlausible, notRaw, rawOnly, trendTrusted } from '../pipeline/build.ts';
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

describe('notRaw (real Cardmarket seller comments)', () => {
  it('spots graded slabs', () => {
    for (const c of ['PSA 7', 'CGC NM/M+ 8.5', 'PSA 6.', 'GSG 9', 'PSA1', 'bgs 8,5', '15804, PSA 8', '14530, CGC9', 'PCA 9.5 - All inquiries', 'Psa 8 173370394 only issue the white spikes', 'graded "GG"/Global grade 9. Is defo PSA 9 worthy', 'GRADED BGS 8.5', 'PSA 9, fresh cert. lots of box toppers!', 'Bgs 9.5, very low pop']) {
      expect(notRaw(c), c).toBe(true);
    }
  });
  it('keeps raw copies, including ones that mention grading', () => {
    for (const c of [null, 'NM-  No PSA 10 candidate', 'PSA 10 candidate!', 'AI Grading 4.5 (If the surface is cleaned, potential grade 9)', 'Sleeved and in top loader', 'Front NM // Back EXC', 'ask for pic 2 white dots', 'Gengar & Mimikyu Tag Team GX, mint']) {
      expect(notRaw(c), String(c)).toBe(false);
    }
  });
  it('drops damaged copies', () => {
    expect(notRaw('small crease on the back')).toBe(true);
    expect(rawOnly([{ price: 1, country: null, comment: 'PSA 9' }, { price: 2, country: null, comment: null }]).map((l) => l.price)).toEqual([2]);
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

describe('farFromUs', () => {
  it('notes EU prices far from the US raw price', async () => {
    const { farFromUs } = await import('../pipeline/build.ts');
    expect(farFromUs(2249, 730)).toMatch(/3\.1× the US raw price/);
    expect(farFromUs(100, 100)).toBeNull();
    expect(farFromUs(null, 100)).toBeNull();
  });
});
