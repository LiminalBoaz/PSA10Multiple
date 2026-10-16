import { z } from 'zod';

/** Cardmarket: the cheapest Near Mint English listings for one product. */
export const CardmarketStats = z.object({
  /** Mean of the 10 cheapest NM English listings from EU sellers. This is the raw baseline. */
  avg10: z.number().positive(),
  median: z.number().positive(),
  min: z.number().positive(),
  max: z.number().positive(),
  /** How many listings went into avg10 (10, or fewer when the market is thin). */
  n: z.number().int().positive(),
  /** Same method, sellers located in the Netherlands only. */
  nl: z.object({ avg: z.number().positive(), n: z.number().int().positive() }).nullable(),
  fetchedAt: z.string(),
});

/** PriceCharting prices in USD. null when PriceCharting has no sales for that grade. */
export const UsdPrices = z.object({
  raw: z.number().positive().nullable(),
  psa8: z.number().positive().nullable(),
  psa9: z.number().positive().nullable(),
  psa10: z.number().positive().nullable(),
});

export const Card = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  set: z.string().min(1),
  number: z.string().nullable(),
  /** Path relative to the site root, e.g. "img/umbreon-vmax-215.webp". */
  image: z.string().nullable(),
  links: z.object({ pricecharting: z.url(), cardmarket: z.url().nullable() }),
  usd: UsdPrices,
  cm: CardmarketStats.nullable(),
});

export const DataFile = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  fx: z.object({ usdToEur: z.number().positive(), date: z.string() }),
  defaults: z.object({ gradingFeeUsd: z.number().nonnegative() }),
  cards: z.array(Card),
});

export type CardmarketStats = z.infer<typeof CardmarketStats>;
export type UsdPrices = z.infer<typeof UsdPrices>;
export type Card = z.infer<typeof Card>;
export type DataFile = z.infer<typeof DataFile>;
