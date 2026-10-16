import { describe, expect, it } from 'vitest';
import { cheapestStats, parseEuro, parseUsd } from '../pipeline/lib/stats.ts';

describe('cheapestStats', () => {
  it('averages only the 10 cheapest', () => {
    const prices = [20, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100];
    const s = cheapestStats(prices)!;
    expect(s.n).toBe(10);
    expect(s.avg).toBe(5.5);
    expect(s.min).toBe(1);
    expect(s.max).toBe(10);
    expect(s.median).toBe(5.5);
  });
  it('uses what is there when fewer than 10', () => {
    expect(cheapestStats([4, 2, 3])).toEqual({ avg: 3, median: 3, min: 2, max: 4, n: 3 });
  });
  it('ignores junk and returns null when empty', () => {
    expect(cheapestStats([Number.NaN, 0, -1])).toBeNull();
    expect(cheapestStats([])).toBeNull();
  });
  it('rounds the average to cents', () => {
    expect(cheapestStats([1, 1, 1.01])!.avg).toBe(1);
  });
});

describe('parseEuro', () => {
  it('reads Cardmarket formats', () => {
    expect(parseEuro('12,50 €')).toBe(12.5);
    expect(parseEuro('1.234,56 €')).toBe(1234.56);
    expect(parseEuro('0,02 €')).toBe(0.02);
    expect(parseEuro('7 €')).toBe(7);
    expect(parseEuro('n/a')).toBeNull();
  });
});

describe('parseUsd', () => {
  it('reads PriceCharting formats', () => {
    expect(parseUsd('$1,234.56')).toBe(1234.56);
    expect(parseUsd(' $12.00 ')).toBe(12);
    expect(parseUsd('-')).toBeNull();
  });
});
