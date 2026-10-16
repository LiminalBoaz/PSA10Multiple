import type { Card } from '../../shared/schema.ts';

/** Price slots for the filter chips, on the raw price in euros. */
export const BUCKETS = [
  { id: '0-25', label: '€0–25', min: 0, max: 25 },
  { id: '25-50', label: '€25–50', min: 25, max: 50 },
  { id: '50-100', label: '€50–100', min: 50, max: 100 },
  { id: '100-250', label: '€100–250', min: 100, max: 250 },
  { id: '250-500', label: '€250–500', min: 250, max: 500 },
  { id: '500-1000', label: '€500–1000', min: 500, max: 1000 },
  { id: '1000+', label: '€1000+', min: 1000, max: Number.POSITIVE_INFINITY },
] as const;

export type BucketId = (typeof BUCKETS)[number]['id'];

/** The Netherlands-only average is shown only when it rests on at least this many listings. */
export const NL_MIN_LISTINGS = 3;

/**
 * Where the raw price comes from:
 * - mine:     the price you entered
 * - listings: average of the cheapest Near Mint English Cardmarket listings
 * - estimate: Cardmarket's own price estimate (all conditions and languages), used until listings are fetched
 */
export type RawSource = 'mine' | 'listings' | 'estimate' | null;

export interface Analysis {
  raw: number | null;
  rawSource: RawSource;
  g8: number | null;
  g9: number | null;
  psa10: number | null;
  fee: number;
  /** What you make if it comes back at that grade: graded − raw − fee. */
  net8: number | null;
  net9: number | null;
  net10: number | null;
  /** The most you can pay and still break even if it grades 9. */
  maxBuy9: number | null;
  multiplier: number | null;
  /** A grade 9 still makes money at this raw price. */
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

export function rawBaseline(card: Card, myPrice?: number | null): { raw: number | null; rawSource: RawSource } {
  if (myPrice != null && myPrice > 0) return { raw: myPrice, rawSource: 'mine' };
  if (card.cm?.listings) return { raw: card.cm.listings.avg10, rawSource: 'listings' };
  if (card.cm?.guide?.trusted && card.cm.guide.trend) return { raw: card.cm.guide.trend, rawSource: 'estimate' };
  return { raw: null, rawSource: null };
}

const minus = (a: number | null, b: number | null, fee: number) => (a == null || b == null ? null : a - b - fee);

export function analyze(card: Card, usdToEur: number, feeEur: number, myPrice?: number | null): Analysis {
  const { raw, rawSource } = rawBaseline(card, myPrice);
  const g8 = toEur(card.usd.g8, usdToEur);
  const g9 = toEur(card.usd.g9, usdToEur);
  const psa10 = toEur(card.usd.psa10, usdToEur);
  const net9 = minus(g9, raw, feeEur);
  const nlRaw = card.cm?.listings?.nl;
  return {
    raw,
    rawSource,
    g8,
    g9,
    psa10,
    fee: feeEur,
    net8: minus(g8, raw, feeEur),
    net9,
    net10: minus(psa10, raw, feeEur),
    maxBuy9: g9 == null ? null : g9 - feeEur,
    multiplier: psa10 != null && raw ? psa10 / raw : null,
    nineSafe: net9 != null && net9 > 0,
    bucket: bucketOf(raw),
    nl: nlRaw && nlRaw.n >= NL_MIN_LISTINGS ? nlRaw : null,
  };
}

export type SortKey = 'profit' | 'multiplier' | 'cheapest';

export const SORTS: { id: SortKey; label: string }[] = [
  { id: 'profit', label: 'Biggest PSA 10 profit' },
  { id: 'multiplier', label: 'Highest multiplier' },
  { id: 'cheapest', label: 'Lowest price' },
];

export interface Row {
  card: Card;
  a: Analysis;
}

/** Sorts a copy of rows. Cards missing the sort value always go last. */
export function sortRows(rows: Row[], key: SortKey): Row[] {
  const value = (r: Row): number | null => (key === 'profit' ? r.a.net10 : key === 'multiplier' ? r.a.multiplier : r.a.raw);
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
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Every word of the query must start a word in the card's name, printing, set or number. */
export function matchesQuery(card: Card, query: string): boolean {
  const words = fold(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const hay = ` ${fold(`${card.name} ${card.variant ?? ''} ${card.set} ${card.number ?? ''}`)}`;
  return words.every((w) => hay.includes(` ${w}`) || (w.length >= 3 && hay.includes(w)));
}

/**
 * Search looks through every card, whatever price slots are selected; otherwise the selected slots
 * filter the list, and no selection means all cards.
 */
export function visibleRows(rows: Row[], query: string, buckets: ReadonlySet<BucketId>): Row[] {
  if (query.trim()) return rows.filter((r) => matchesQuery(r.card, query));
  if (buckets.size === 0) return rows;
  return rows.filter((r) => r.a.bucket != null && buckets.has(r.a.bucket));
}

/** Tapping "All" clears the selection; tapping a slot toggles it. */
export function toggleBucket(selected: ReadonlySet<BucketId>, id: BucketId | 'all'): Set<BucketId> {
  if (id === 'all') return new Set();
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
