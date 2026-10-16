// Cardmarket's public daily files: the product catalogue and the price guide for Pokémon (game 6).
import { z } from 'zod';
import { getText } from './http.ts';

const BASE = 'https://downloads.s3.cardmarket.com/productCatalog';

const Product = z.object({ idProduct: z.number(), name: z.string(), idExpansion: z.number() });
const Guide = z.object({
  idProduct: z.number(),
  trend: z.number().nullable().optional(),
  low: z.number().nullable().optional(),
  avg30: z.number().nullable().optional(),
  'trend-holo': z.number().nullable().optional(),
  'low-holo': z.number().nullable().optional(),
  'avg30-holo': z.number().nullable().optional(),
});
export type GuideRow = z.infer<typeof Guide>;

export interface Catalog {
  createdAt: string;
  product: (id: number) => z.infer<typeof Product> | undefined;
  guide: (id: number) => GuideRow | undefined;
  /** All versions of a card in one expansion, in Cardmarket's V1, V2, … order (ascending idProduct). */
  versions: (id: number) => number[];
}

export const baseName = (name: string) => name.split(' [')[0]!.trim();

export async function loadCatalog(): Promise<Catalog> {
  const prods = z.object({ products: z.array(Product) }).parse(JSON.parse(await getText(`${BASE}/productList/products_singles_6.json`, { maxAgeH: 20 })));
  const guide = z
    .object({ createdAt: z.string(), priceGuides: z.array(Guide) })
    .parse(JSON.parse(await getText(`${BASE}/priceGuide/price_guide_6.json`, { maxAgeH: 20 })));
  const byId = new Map(prods.products.map((p) => [p.idProduct, p]));
  const guideById = new Map(guide.priceGuides.map((g) => [g.idProduct, g]));
  const groups = new Map<string, number[]>();
  for (const p of prods.products) {
    const k = `${p.idExpansion}|${baseName(p.name)}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(p.idProduct);
  }
  for (const ids of groups.values()) ids.sort((a, b) => a - b);
  return {
    createdAt: guide.createdAt,
    product: (id) => byId.get(id),
    guide: (id) => guideById.get(id),
    versions: (id) => {
      const p = byId.get(id);
      return p ? groups.get(`${p.idExpansion}|${baseName(p.name)}`) ?? [id] : [];
    },
  };
}
