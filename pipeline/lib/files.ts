// Intermediate files between pipeline steps. Each step reads the previous step's file,
// so any step can be rerun on its own.
import { z } from 'zod';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { UsdPrices } from '../../shared/schema.ts';

export const Contender = z.object({
  id: z.string(),
  name: z.string(),
  set: z.string(),
  number: z.string().nullable(),
  pricechartingUrl: z.url(),
});
export const ContendersFile = z.object({ fetchedAt: z.string(), source: z.string(), skipped: z.array(z.string()), cards: z.array(Contender) });

export const PcEntry = z.object({ usd: UsdPrices, imageUrl: z.string().nullable(), fetchedAt: z.string() });
export const PriceChartingFile = z.record(z.string(), PcEntry);

export const CmListing = z.object({ price: z.number().positive(), country: z.string().nullable() });
export const CmEntry = z.object({
  productUrl: z.url().nullable(),
  /** Cheapest NM-or-better English listings, any EU seller, cheapest first. */
  listings: z.array(CmListing),
  /** Same filter, sellers in the Netherlands only. */
  nlListings: z.array(CmListing),
  fetchedAt: z.string(),
  note: z.string().optional(),
});
export const CardmarketFile = z.record(z.string(), CmEntry);

export type Contender = z.infer<typeof Contender>;
export type ContendersFile = z.infer<typeof ContendersFile>;
export type PcEntry = z.infer<typeof PcEntry>;
export type CmEntry = z.infer<typeof CmEntry>;

export const PATHS = {
  contenders: 'data/contenders.json',
  pricecharting: 'data/pricecharting.json',
  cardmarket: 'data/cardmarket.json',
  overrides: 'data/cm-overrides.json',
  out: 'public/cards.json',
  img: 'public/img',
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

export function slug(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
