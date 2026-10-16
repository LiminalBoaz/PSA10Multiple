import { describe, expect, it } from 'vitest';
import { setFromUrl, splitTitle } from '../pipeline/contenders.ts';
import { slug } from '../pipeline/lib/files.ts';

describe('splitTitle', () => {
  it('splits name and card number', () => {
    expect(splitTitle('Umbreon VMAX #215')).toEqual({ name: 'Umbreon VMAX', number: '215' });
    expect(splitTitle('Pikachu #SWSH020')).toEqual({ name: 'Pikachu', number: 'SWSH020' });
    expect(splitTitle('Charizard')).toEqual({ name: 'Charizard', number: null });
  });
});

describe('setFromUrl', () => {
  it('turns a PriceCharting path into a set name', () => {
    expect(setFromUrl('https://www.pricecharting.com/game/pokemon-evolving-skies/umbreon-vmax-215')).toBe('Evolving Skies');
    expect(setFromUrl('https://www.pricecharting.com/game/pokemon-151/mew-ex-205')).toBe('151');
  });
});

describe('slug', () => {
  it('makes stable ids', () => {
    expect(slug('Pokémon Center Pikachu', '25')).toBe('pokemon-center-pikachu-25');
  });
});
