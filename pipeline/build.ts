// Step 4: merge contenders + PriceCharting + Cardmarket into public/cards.json, fetch thumbnails,
// and fail loudly if the data is too thin to trust.
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { DataFile, type Card } from '../shared/schema.ts';
import { CardmarketFile, ContendersFile, PATHS, PriceChartingFile, readJson, writeJson } from './lib/files.ts';
import { usdToEur } from './lib/fx.ts';
import { pace } from './lib/http.ts';
import { cheapestStats } from './lib/stats.ts';

const GRADING_FEE_USD = 25; // PokeViews' assumption; adjustable in the app
const MIN_PC_SHARE = 0.9;
const MIN_CM_SHARE = 0.8;

async function thumbnail(id: string, url: string | null): Promise<string | null> {
  if (!url) return null;
  const rel = `img/${id}.webp`;
  const out = `public/${rel}`;
  if (existsSync(out)) return rel;
  try {
    await pace(300);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await sharp(buf).resize({ width: 300, withoutEnlargement: true }).webp({ quality: 72 }).toFile(out);
    return rel;
  } catch (e) {
    console.warn(`  ! image for ${id}: ${(e as Error).message}`);
    return null;
  }
}

const contenders = await readJson(PATHS.contenders, ContendersFile);
const pc = await readJson(PATHS.pricecharting, PriceChartingFile);
const cm = await readJson(PATHS.cardmarket, CardmarketFile, {});
const fx = await usdToEur();
await mkdir(PATHS.img, { recursive: true });

const cards: Card[] = [];
const thin: string[] = [];
const noCm: string[] = [];
const noPc: string[] = [];

for (const c of contenders.cards) {
  const p = pc[c.id];
  const m = cm[c.id];
  if (!p?.usd.psa10) noPc.push(c.id);
  const eu = m ? cheapestStats(m.listings.map((l) => l.price)) : null;
  const nl = m ? cheapestStats(m.nlListings.map((l) => l.price)) : null;
  if (!eu) noCm.push(c.id);
  else if (eu.n < 10) thin.push(`${c.id} (${eu.n})`);
  cards.push({
    id: c.id,
    name: c.name,
    set: c.set,
    number: c.number,
    image: await thumbnail(c.id, p?.imageUrl ?? null),
    links: { pricecharting: c.pricechartingUrl, cardmarket: m?.productUrl ?? null },
    usd: p?.usd ?? { raw: null, psa8: null, psa9: null, psa10: null },
    cm: eu && m ? { avg10: eu.avg, median: eu.median, min: eu.min, max: eu.max, n: eu.n, nl: nl ? { avg: nl.avg, n: nl.n } : null, fetchedAt: m.fetchedAt } : null,
  });
}

const data = DataFile.parse({ version: 1, generatedAt: new Date().toISOString(), fx, defaults: { gradingFeeUsd: GRADING_FEE_USD }, cards });
await writeJson(PATHS.out, data);

const total = cards.length;
const pcShare = total ? 1 - noPc.length / total : 0;
const cmShare = total ? 1 - noCm.length / total : 0;
console.log(`\nQuality report — ${total} cards (${contenders.skipped.length} non-English skipped)`);
console.log(`  PriceCharting PSA 10 price: ${(pcShare * 100).toFixed(0)}%  missing: ${noPc.join(', ') || 'none'}`);
console.log(`  Cardmarket NM English:      ${(cmShare * 100).toFixed(0)}%  missing: ${noCm.join(', ') || 'none'}`);
console.log(`  Fewer than 10 listings:     ${thin.join(', ') || 'none'}`);
console.log(`  Images:                     ${cards.filter((c) => c.image).length}/${total}`);
console.log(`  $1 = €${fx.usdToEur} (${fx.date}) → ${PATHS.out}`);

if (total === 0 || pcShare < MIN_PC_SHARE || cmShare < MIN_CM_SHARE) {
  console.error(`\nData quality below threshold (PriceCharting ≥ ${MIN_PC_SHARE * 100}%, Cardmarket ≥ ${MIN_CM_SHARE * 100}%).`);
  process.exit(1);
}
