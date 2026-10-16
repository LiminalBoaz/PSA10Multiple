import type { Card } from '../../shared/schema.ts';

/** Price ranges for the chips, based on the raw baseline in euros. */
export const BUCKETS = [
  { id: 'u10', label: '<€10', min: 0, max: 10 },
  { id: '10-25', label: '€10–25', min: 10, max: 25 },
  { id: '25-50', label: '€25–50', min: 25, max: 50 },
  { id: '50-100', label: '€50–100', min: 50, max: 100 },
  { id: '100-250', label: '€100–250', min: 100, max: 250 },
  { id: '250+', label: '€250+', min: 250, max: Number.POSITIVE_INFINITY },
] as const;

export type BucketId = (typeof BUCKETS)[number]['id'];

/** The Netherlands-only average is shown only when it rests on at least this many listings. */
export const NL_MIN_LISTINGS = 3;

/** Where the raw baseline came from. */
export type RawSource = 'listings' | 'trend' | null;

export interface Analysis {
  /** Raw baseline in EUR: mean of the 10 cheapest NM English listings, else Cardmarket's trend when trusted. */
  raw: number | null;
  rawSource: RawSource;
  g8: number | null;
  g9: number | null;
  psa10: number | null;
  /** Grading fee converted to EUR. */
  fee: number;
  /** Profit if the card comes back at that grade: graded − raw − fee. */
  net8: number | null;
  net9: number | null;
  net10: number | null;
  /** Highest price you can pay and still break even if it grades a 9. */
  maxBuy9: number | null;
  /** Highest price you can pay and still break even if it grades a PSA 10. */
  maxBuy10: number | null;
  /** PSA 10 price divided by the raw baseline. */
  multiplier: number | null;
  /** True when a grade 9 still makes a profit at the baseline. */
  nineSafe: boolean;
  bucket: BucketId | null;
  nl: { avg: number; n: number } | null;
}

export function toEur(usd: number | null, usdToEur: number): number | null {
  return usd == null ? null : usd * usdToEur;
}

export function bucketOf(eur: number | null): BucketId | null {
  if (eur == null || !(eur >= 0)) return null;
  return BUCKETS.find((b) => eur >= b.min && eur < b.max)?.id ?? null;
}

export function rawBaseline(card: Card): { raw: number | null; rawSource: RawSource } {
  if (card.cm?.listings) return { raw: card.cm.listings.avg10, rawSource: 'listings' };
  if (card.cm?.guide?.trusted && card.cm.guide.trend) return { raw: card.cm.guide.trend, rawSource: 'trend' };
  return { raw: null, rawSource: null };
}

function minus(a: number | null, b: number | null, fee: number): number | null {
  return a == null || b == null ? null : a - b - fee;
}

export function analyze(card: Card, usdToEur: number, feeUsd: number): Analysis {
  const fee = feeUsd * usdToEur;
  const { raw, rawSource } = rawBaseline(card);
  const g8 = toEur(card.usd.g8, usdToEur);
  const g9 = toEur(card.usd.g9, usdToEur);
  const psa10 = toEur(card.usd.psa10, usdToEur);
  const net9 = minus(g9, raw, fee);
  const nlRaw = card.cm?.listings?.nl;
  return {
    raw,
    rawSource,
    g8,
    g9,
    psa10,
    fee,
    net8: minus(g8, raw, fee),
    net9,
    net10: minus(psa10, raw, fee),
    maxBuy9: g9 == null ? null : g9 - fee,
    maxBuy10: psa10 == null ? null : psa10 - fee,
    multiplier: psa10 != null && raw ? psa10 / raw : null,
    nineSafe: net9 != null && net9 > 0,
    bucket: bucketOf(raw),
    nl: nlRaw && nlRaw.n >= NL_MIN_LISTINGS ? nlRaw : null,
  };
}

export type SortKey = 'profit' | 'multiplier' | 'cheapest';

export interface Row {
  card: Card;
  a: Analysis;
}

/** Sorts a copy of rows. Cards missing the sort value always go last. */
export function sortRows(rows: Row[], key: SortKey): Row[] {
  const value = (r: Row): number | null =>
    key === 'profit' ? r.a.net10 : key === 'multiplier' ? r.a.multiplier : r.a.raw;
  const dir = key === 'cheapest' ? 1 : -1;
  return [...rows].sort((x, y) => {
    const a = value(x);
    const b = value(y);
    if (a == null && b == null) return x.card.name.localeCompare(y.card.name);
    if (a == null) return 1;
    if (b == null) return -1;
    return (a - b) * dir;
  });
}

const fold = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Every word of the query must appear in the card's name, variant, set or number. */
export function matchesQuery(card: Card, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fold(`${card.name} ${card.variant ?? ''} ${card.set} ${card.number ?? ''}`);
  return words.every((w) => hay.includes(w));
}
