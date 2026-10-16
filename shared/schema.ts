import { z } from 'zod';

const Money = z.number().positive();

/** Cardmarket's own daily price guide for the product (all languages and conditions mixed). */
export const CmGuide = z.object({
  trend: Money.nullable(),
  low: Money.nullable(),
  avg30: Money.nullable(),
});

/** The guide plus whether its trend is close enough to the US raw price to stand in as the baseline. */
export const CmGuideChecked = CmGuide.extend({ trusted: z.boolean() });

/** The cheapest Near Mint English listings on Cardmarket for one product. */
export const CmListings = z.object({
  /** Mean of the 10 cheapest NM English listings from EU sellers. This is the raw baseline. */
  avg10: Money,
  median: Money,
  min: Money,
  max: Money,
  /** How many listings went into avg10 (10, or fewer when the market is thin). */
  n: z.number().int().positive(),
  /** Same method, sellers located in the Netherlands only. */
  nl: z.object({ avg: Money, n: z.number().int().positive() }).nullable(),
  fetchedAt: z.string(),
});

export const Cardmarket = z.object({
  idProduct: z.number().int().positive(),
  guide: CmGuideChecked.nullable(),
  listings: CmListings.nullable(),
});

/** PriceCharting sold prices in USD. Grade 8 and 9 cover all graders; PSA 10 is PSA only. */
export const UsdPrices = z.object({
  raw: Money.nullable(),
  g8: Money.nullable(),
  g9: Money.nullable(),
  psa10: Money.nullable(),
});

export const Card = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  set: z.string().min(1),
  number: z.string().nullable(),
  /** Printing that matters for price, e.g. "1st Edition" or "Reverse Holo". */
  variant: z.string().nullable(),
  /** Path relative to the site root, e.g. "img/lugia-v-138.webp". */
  image: z.string().nullable(),
  /** PriceCharting sales in the last year, as reported by PokeViews. */
  salesPerYear: z.number().int().nonnegative().nullable(),
  links: z.object({ pricecharting: z.url().nullable(), cardmarket: z.url() }),
  usd: UsdPrices,
  cm: Cardmarket.nullable(),
});

export const DataFile = z.object({
  version: z.literal(2),
  generatedAt: z.string(),
  fx: z.object({ usdToEur: z.number().positive(), date: z.string() }),
  defaults: z.object({ gradingFeeUsd: z.number().nonnegative() }),
  cards: z.array(Card),
});

export type CmGuide = z.infer<typeof CmGuide>;
export type CmListings = z.infer<typeof CmListings>;
export type UsdPrices = z.infer<typeof UsdPrices>;
export type Card = z.infer<typeof Card>;
export type DataFile = z.infer<typeof DataFile>;
