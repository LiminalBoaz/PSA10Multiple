import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseQuery, sameNumber } from '../src/lib/tcgdex.ts';

describe('parseQuery', () => {
  it('splits name words from the card number', () => {
    expect(parseQuery('raichu 211')).toEqual({ words: ['raichu'], number: '211' });
    expect(parseQuery('Raichu #211/193')).toEqual({ words: ['raichu'], number: '211' });
    expect(parseQuery('umbreon vmax TG23')).toEqual({ words: ['umbreon', 'vmax'], number: 'tg23' });
    expect(parseQuery('mew ex svp053')).toEqual({ words: ['mew', 'ex'], number: 'svp053' });
    expect(parseQuery('Pokémon Center')).toEqual({ words: ['pokemon', 'center'], number: null });
  });
});

describe('sameNumber', () => {
  it('ignores case and leading zeros', () => {
    expect(sameNumber('053', '53')).toBe(true);
    expect(sameNumber('TG05', 'tg5')).toBe(true);
    expect(sameNumber('211', '21')).toBe(false);
  });
});

describe('searchCards', () => {
  afterEach(() => vi.unstubAllGlobals());

  const sets = [
    { id: 'swsh7', name: 'Evolving Skies' },
    { id: 'sv02', name: 'Paldea Evolved' },
    { id: 'sv03.5', name: '151' },
  ];
  const cards: Record<string, { id: string; localId: string; name: string }[]> = {
    raichu: [
      { id: 'swsh7-50', localId: '50', name: 'Raichu' },
      { id: 'sv02-211', localId: '211', name: 'Raichu' },
      { id: 'sv02-63', localId: '63', name: 'Raichu' },
    ],
    'charizard ex': [
      { id: 'sv03.5-006', localId: '006', name: 'Charizard ex' },
      { id: 'sv03.5-199', localId: '199', name: 'Charizard ex' },
    ],
  };
  async function load() {
    vi.stubGlobal('fetch', async (url: string) => {
      const u = new URL(url);
      if (u.pathname.endsWith('/sets')) return new Response(JSON.stringify(sets));
      return new Response(JSON.stringify(cards[u.searchParams.get('name') ?? ''] ?? []));
    });
    vi.resetModules();
    return import('../src/lib/tcgdex.ts');
  }

  it('finds Raichu 211 from Paldea Evolved by name and number', async () => {
    const { searchCards } = await load();
    expect((await searchCards('raichu 211')).map((c) => c.id)).toEqual(['sv02-211']);
  });
  it('narrows by set name words', async () => {
    const { searchCards } = await load();
    expect((await searchCards('raichu paldea')).map((c) => c.id)).toEqual(['sv02-211', 'sv02-63']);
  });
  it('treats a bare number as a set name when no card has that number', async () => {
    const { searchCards } = await load();
    expect((await searchCards('charizard ex 151')).map((c) => c.id).sort()).toEqual(['sv03.5-006', 'sv03.5-199']);
  });
  it('matches numbers with leading zeros', async () => {
    const { searchCards } = await load();
    expect((await searchCards('charizard ex 6')).map((c) => c.id)).toEqual(['sv03.5-006']);
  });
});
