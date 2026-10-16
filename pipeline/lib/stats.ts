export interface Listing {
  /** Price in EUR as shown on Cardmarket (item price, excluding shipping). */
  price: number;
  /** Seller location as Cardmarket names it, e.g. "Netherlands". */
  country: string | null;
}

export interface CheapestStats {
  avg: number;
  median: number;
  min: number;
  max: number;
  n: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Mean, median and range of the `take` cheapest prices. null when there are none. */
export function cheapestStats(prices: number[], take = 10): CheapestStats | null {
  const sorted = prices.filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b).slice(0, take);
  const n = sorted.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  const median = n % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return {
    avg: round2(sorted.reduce((s, p) => s + p, 0) / n),
    median: round2(median),
    min: sorted[0]!,
    max: sorted[n - 1]!,
    n,
  };
}

/** Parses Cardmarket price text such as "1.234,56 €" or "12,50 €". */
export function parseEuro(text: string): number | null {
  const m = text.replace(/\s/g, '').match(/(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?€?/);
  if (!m) return null;
  const whole = m[1]!.replace(/\./g, '');
  const n = Number(`${whole}.${m[2] ?? '0'}`);
  return Number.isFinite(n) ? n : null;
}

/** Parses PriceCharting price text such as "$1,234.56". */
export function parseUsd(text: string): number | null {
  const m = text.replace(/\s/g, '').match(/\$([\d,]+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]!.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}
