// Step 1: the card list behind PokeViews' grading-opportunity heatmap.
import { z } from 'zod';
import { PATHS, slug, splitVariant, writeJson, type Contender } from './lib/files.ts';
import { getText } from './lib/http.ts';

const SOURCE = 'https://storage.googleapis.com/pokeviews-prod/grading/grading_opportunity.json.gz';

const PvRow = z.object({
  card_name: z.string(),
  set_name: z.string(),
  card_number: z.string().nullable(),
  series_name: z.string(),
  ungraded_price: z.number(),
  psa_10_price: z.number(),
  annual_sales_volume: z.number().nullable(),
  image_url: z.string().nullable(),
  date: z.string(),
});

/** PokeViews names images after the source product: "450289.webp" (TCGplayer) or "pc_2252747.webp" (PriceCharting). */
export function idsFromImage(url: string | null): { tcgplayerId: number | null; pricechartingId: number | null } {
  const file = url?.split('/').pop() ?? '';
  const pc = file.match(/^pc_(\d+)\./);
  const tp = file.match(/^(\d+)(?:_\d+w)?\./);
  return { tcgplayerId: tp ? Number(tp[1]) : null, pricechartingId: pc ? Number(pc[1]) : null };
}

export function toContender(r: z.infer<typeof PvRow>): Contender {
  const { name, variant } = splitVariant(r.card_name);
  const number = r.card_number && r.card_number !== 'None' ? r.card_number : null;
  return {
    id: slug(r.card_name, r.set_name, number),
    name,
    fullName: r.card_name,
    variant,
    set: r.set_name,
    series: r.series_name,
    number,
    imageUrl: r.image_url,
    ...idsFromImage(r.image_url),
    pv: { raw: r.ungraded_price, psa10: r.psa_10_price, salesPerYear: r.annual_sales_volume, date: r.date },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = z.array(PvRow).parse(JSON.parse(await getText(SOURCE, { maxAgeH: 6 })));
  const cards = rows.map(toContender);
  const dupes = cards.length - new Set(cards.map((c) => c.id)).size;
  if (dupes) throw new Error(`${dupes} duplicate card ids`);
  await writeJson(PATHS.contenders, { fetchedAt: new Date().toISOString(), source: SOURCE, cards });
  console.log(`${cards.length} contenders (PokeViews data of ${rows[0]?.date}) → ${PATHS.contenders}`);
}
