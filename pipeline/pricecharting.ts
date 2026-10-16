// Step 2: graded prices (USD) and image for each contender from its PriceCharting page.
import * as cheerio from 'cheerio';
import { ContendersFile, PATHS, PriceChartingFile, readJson, writeJson, type PcEntry } from './lib/files.ts';
import { getText } from './lib/http.ts';
import { parseUsd } from './lib/stats.ts';

/** PriceCharting reuses its video-game price slots for card grades. */
const SLOTS = { raw: '#used_price', psa8: '#new_price', psa9: '#graded_price', psa10: '#manual_only_price' } as const;

export function parsePriceCharting(html: string): Omit<PcEntry, 'fetchedAt'> {
  const $ = cheerio.load(html);
  const price = (sel: string) => parseUsd($(`${sel} .price`).first().text() || $(sel).first().text());
  const img = $('#product_details img, .cover img').first().attr('src') ?? $('meta[property="og:image"]').attr('content') ?? null;
  return {
    usd: { raw: price(SLOTS.raw), psa8: price(SLOTS.psa8), psa9: price(SLOTS.psa9), psa10: price(SLOTS.psa10) },
    imageUrl: img && /^https?:/.test(img) ? img.replace(/\/\d+\.jpg$/, '/240.jpg') : null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { cards } = await readJson(PATHS.contenders, ContendersFile);
  const out = await readJson(PATHS.pricecharting, PriceChartingFile, {});
  for (const [i, c] of cards.entries()) {
    try {
      const html = await getText(c.pricechartingUrl, { paceMs: 2000 });
      out[c.id] = { ...parsePriceCharting(html), fetchedAt: new Date().toISOString() };
      const u = out[c.id]!.usd;
      console.log(`${i + 1}/${cards.length} ${c.id}: raw $${u.raw} · 8 $${u.psa8} · 9 $${u.psa9} · 10 $${u.psa10}`);
    } catch (e) {
      console.warn(`${i + 1}/${cards.length} ${c.id}: ${(e as Error).message}`);
    }
    await writeJson(PATHS.pricecharting, out);
  }
}
