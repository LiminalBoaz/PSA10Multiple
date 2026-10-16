import { describe, expect, it } from 'vitest';
import { codeHasNumber, parseCmUrl } from '../pipeline/lib/slug.ts';

describe('parseCmUrl', () => {
  it('reads set, version and code from a Cardmarket product URL', () => {
    expect(parseCmUrl('https://www.cardmarket.com/en/Pokemon/Products/Singles/Skyridge/Vaporeon-V1-SKH31?language=1&minCondition=2')).toEqual({
      url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Skyridge/Vaporeon-V1-SKH31',
      expansion: 'Skyridge',
      version: 1,
      code: 'SKH31',
    });
    expect(parseCmUrl('https://cardmarket.com/en/Pokemon/Products/Singles/SV-Black-Star-Promos/Mew-ex-SVP053?utm_source=x')).toMatchObject({
      url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/SV-Black-Star-Promos/Mew-ex-SVP053',
      version: null,
      code: 'SVP053',
    });
  });
  it('rejects non-product URLs', () => {
    expect(parseCmUrl('https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=mew')).toBeNull();
    expect(parseCmUrl('not a url')).toBeNull();
  });
});

describe('codeHasNumber', () => {
  it('matches the card number at the end of the code', () => {
    expect(codeHasNumber('SKH31', 'H31')).toBe(true);
    expect(codeHasNumber('SIT138', '138')).toBe(true);
    expect(codeHasNumber('SVP053', '53')).toBe(true);
    expect(codeHasNumber('SITTG29', 'TG29')).toBe(true);
    expect(codeHasNumber('CRZGG10', 'GG10')).toBe(true);
  });
  it('rejects codes without the number', () => {
    expect(codeHasNumber('OS', '98')).toBe(false);
    expect(codeHasNumber('V2', '192')).toBe(false);
    expect(codeHasNumber('SIT139', '138')).toBe(false);
    expect(codeHasNumber('SIT1138', '138')).toBe(false);
  });
});
