// Intermediate files between pipeline steps. Each step reads the previous step's file,
// so any step can be rerun on its own.
import { z } from 'zod';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { CmGuide, UsdPrices } from '../../shared/schema.ts';

export const Contender = z.object({
  id: z.string(),
  /** Name without the variant, e.g. "Ditto". */
  name: z.string(),
  /** Name exactly as PokeViews shows it, e.g. "Ditto (1st Edition)". */
  fullName: z.string(),
  variant: z.string().nullable(),
  set: z.string(),
  series: z.string(),
  number: z.string().nullable(),
  imageUrl: z.string().nullable(),
  /** TCGplayer product id, when PokeViews' image name carries one. */
  tcgplayerId: z.number().int().nullable(),
  /** PriceCharting product id, when PokeViews' image name carries one. */
  pricechartingId: z.number().int().nullable(),
  /** PokeViews' own numbers; null for cards added by hand. */
  pv: z.object({ raw: z.number(), psa10: z.number(), salesPerYear: z.number().int().nullable(), date: z.string() }).nullable(),
  /** Added by hand through the app (an "Add card" issue). */
  added: z.boolean().default(false),
  /** Links given when the card was added, used instead of searching. */
  hints: z.object({ pricecharting: z.url().optional(), cardmarket: z.url().optional(), tcgdex: z.string().optional() }).default({}),
});
export const ContendersFile = z.object({ fetchedAt: z.string(), source: z.string(), cards: z.array(Contender) });

export const PcEntry = z.object({
  url: z.url(),
  title: z.string(),
  usd: UsdPrices,
  /** How far PriceCharting's raw and PSA 10 are from PokeViews' (0 = identical). */
  mismatch: z.number(),
  fetchedAt: z.string(),
});
export const PriceChartingFile = z.record(z.string(), PcEntry);

export const TcgdexEntry = z.object({
  tcgdexId: z.string(),
  setName: z.string(),
  setCode: z.string().nullable(),
  idProduct: z.number().int().positive(),
  guide: CmGuide.nullable(),
  /** TCGplayer market price (USD), used to sanity-check the Cardmarket match. */
  tcgplayerMarket: z.number().nullable(),
  matchedBy: z.string(),
  /** TCGdex image base URL (append "/high.webp"); used for cards without a PokeViews image. */
  image: z.string().nullable().optional(),
  /** Release date of the card's set (YYYY-MM-DD). */
  released: z.string().nullable().optional(),
});
export const TcgdexFile = z.record(z.string(), TcgdexEntry);

export const CmListing = z.object({ price: z.number().positive(), country: z.string().nullable(), comment: z.string().nullable().optional() });
export const CmEntry = z.object({
  productUrl: z.url().nullable(),
  /** Cheapest NM-or-better English listings, any EU seller, cheapest first. */
  listings: z.array(CmListing),
  /** Same filter, sellers in the Netherlands only. */
  nlListings: z.array(CmListing),
  fetchedAt: z.string(),
  /** When the Netherlands-only listings were fetched; absent if never. */
  nlFetchedAt: z.string().nullable().optional(),
  /** Card name and number as the scraper read them from the page, e.g. "Vaporeon SKH #31". */
  cardName: z.string().nullable().optional(),
});
export const CardmarketFile = z.record(z.string(), CmEntry);

export type Contender = z.infer<typeof Contender>;
export type PcEntry = z.infer<typeof PcEntry>;
export type TcgdexEntry = z.infer<typeof TcgdexEntry>;
export type CmEntry = z.infer<typeof CmEntry>;

export const PATHS = {
  contenders: 'data/contenders.json',
  pricecharting: 'data/pricecharting.json',
  tcgdex: 'data/tcgdex.json',
  cardmarket: 'data/cardmarket.json',
  out: 'public/cards.json',
  img: 'public/img',
  manual: 'data/manual.json',
  /** Card ids removed from the list for everyone (PokeViews keeps listing them). */
  excluded: 'data/excluded.json',
} as const;

export async function readJson<T>(path: string, schema: z.ZodType<T>, fallback?: T): Promise<T> {
  try {
    return schema.parse(JSON.parse(await readFile(path, 'utf8')));
  } catch (e) {
    if (fallback !== undefined && (e as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw e;
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 1)}\n`);
}

export { slug } from '../../shared/slug.ts';

/** "Ditto (1st Edition)" → { name: "Ditto", variant: "1st Edition" } */
export function splitVariant(fullName: string): { name: string; variant: string | null } {
  const m = fullName.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return m ? { name: m[1]!.trim(), variant: m[2]!.trim() } : { name: fullName.trim(), variant: null };
}

/** Compares card numbers loosely: "053" = "53", "tg05" = "TG5". */
export function sameNumber(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const n = (s: string) => s.toUpperCase().replace(/^([A-Z]*)0*(\d)/, '$1$2');
  return n(a) === n(b);
}

export const normSet = (s: string) =>
  s.toLowerCase().replace(/^pokemon\s+/, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
