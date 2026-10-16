// Step 5: merge PokeViews + PriceCharting + TCGdex/Cardmarket into public/cards.json, make thumbnails,
// print a quality report, and refuse to publish data that is too thin to trust.
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { DataFile, type Card } from '../shared/schema.ts';
import { CardmarketFile, ContendersFile, PATHS, PriceChartingFile, readJson, TcgdexFile, writeJson, type CmEntry, type TcgdexEntry } from './lib/files.ts';
import { usdToEur } from './lib/fx.ts';
import { pace } from './lib/http.ts';
import { cheapestStats, type Listing } from './lib/stats.ts';
import { MAX_MISMATCH } from './pricecharting.ts';
import { CmProductsFile, type CmProduct } from './cmproducts.ts';
import { sameNumber } from './lib/files.ts';

const GRADING_FEE_USD = 25; // PokeViews' assumption; adjustable in the app
/** Cardmarket's trend stands in for the listings only when it is this close to the US raw price. */
export const TREND_BAND = [0.5, 2] as const;
/** Listings this far from the US raw price suggest the wrong Cardmarket product (another version of the card). */
export const LISTINGS_BAND = [0.33, 3] as const;
const MIN_GRADED_SHARE = 0.95;
const MIN_CM_SHARE = 0.8;

/** Listings that are slabs or otherwise not a plain raw copy, judged from the seller's comment. */
const NOT_RAW = /\b(psa|bgs|cgc|beckett|graded|slab|tag|ace|sgc)\b|\b(proxy|damaged|crease|custom)\b/i;
export function rawOnly(listings: (Listing & { comment?: string | null })[]): Listing[] {
  return listings.filter((l) => !NOT_RAW.test(l.comment ?? ''));
}

export function trendTrusted(trend: number | null, usRawEur: number | null): boolean {
  if (!trend || !usRawEur) return false;
  const r = trend / usRawEur;
  return r >= TREND_BAND[0] && r <= TREND_BAND[1];
}

async function thumbnail(id: string, url: string | null): Promise<string | null> {
  if (!url) return null;
  const rel = `img/${id}.webp`;
  const out = `public/${rel}`;
  if (existsSync(out)) return rel;
  try {
    await pace(200);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await sharp(Buffer.from(await res.arrayBuffer())).resize({ width: 300, withoutEnlargement: true }).webp({ quality: 74 }).toFile(out);
    return rel;
  } catch (e) {
    console.warn(`  ! image for ${id}: ${(e as Error).message}`);
    return null;
  }
}

export function listingsPlausible(avg: number, usRawEur: number | null): boolean {
  if (!usRawEur) return true;
  const r = avg / usRawEur;
  return r >= LISTINGS_BAND[0] && r <= LISTINGS_BAND[1];
}

const suspicious: string[] = [];

/** The scraper reports the card as e.g. "Lugia V SIT #138"; its number must be the card's number. */
export function scrapedNumberMatches(cardName: string | null | undefined, number: string | null): boolean {
  if (!cardName || !number) return true;
  const m = cardName.match(/#\s*([A-Za-z]*\d+)\s*$/);
  return !m || sameNumber(m[1]!, number) || sameNumber(m[1]!.replace(/^[A-Za-z]+/, ''), number.replace(/^[A-Za-z]+/, ''));
}

function cardmarketPart(
  prod: CmProduct | undefined,
  t: TcgdexEntry | undefined,
  m: CmEntry | undefined,
  usRawEur: number | null,
  label: string,
  number: string | null,
): Card['cm'] {
  if (!prod?.url && !t) return null;
  let eu = m ? cheapestStats(rawOnly(m.listings).map((l) => l.price)) : null;
  if (eu && m && !scrapedNumberMatches(m.cardName, number)) {
    suspicious.push(`${label} (page shows "${m.cardName}")`);
    eu = null;
  } else if (eu && !listingsPlausible(eu.avg, usRawEur)) {
    suspicious.push(`${label} (listings €${eu.avg} vs US €${usRawEur?.toFixed(0)})`);
    eu = null;
  }
  const nl = m && eu ? cheapestStats(rawOnly(m.nlListings).map((l) => l.price)) : null;
  const idProduct = prod?.idProduct ?? null;
  const guide = t?.guide && idProduct != null && idProduct === t.idProduct ? { ...t.guide, trusted: trendTrusted(t.guide.trend, usRawEur) } : null;
  return {
    idProduct,
    guide,
    listings:
      eu && m
        ? { avg10: eu.avg, median: eu.median, min: eu.min, max: eu.max, n: eu.n, nl: nl ? { avg: nl.avg, n: nl.n } : null, nlChecked: Boolean(m.nlFetchedAt), fetchedAt: m.fetchedAt }
        : null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { cards: contenders } = await readJson(PATHS.contenders, ContendersFile);
  const pc = await readJson(PATHS.pricecharting, PriceChartingFile, {});
  const td = await readJson(PATHS.tcgdex, TcgdexFile, {});
  const cm = await readJson(PATHS.cardmarket, CardmarketFile, {});
  const products = await readJson('data/cmproducts.json', CmProductsFile, {});
  const fx = await usdToEur();
  await mkdir(PATHS.img, { recursive: true });

  const cards: Card[] = [];
  const report = { pcFallback: [] as string[], noCm: [] as string[], untrusted: [] as string[], listings: 0, thin: [] as string[], noImage: [] as string[] };

  for (const c of contenders) {
    const p = pc[c.id] && pc[c.id]!.mismatch <= MAX_MISMATCH ? pc[c.id]! : null;
    // Without a PriceCharting match, PokeViews' own raw and PSA 10 (also PriceCharting data) still hold.
    const usd = p?.usd ?? { raw: c.pv.raw, g8: null, g9: null, psa10: c.pv.psa10 };
    if (!p) report.pcFallback.push(c.id);
    const usRawEur = usd.raw == null ? null : usd.raw * fx.usdToEur;
    const cmPart = cardmarketPart(products[c.id], td[c.id], cm[c.id], usRawEur, c.fullName, c.number);
    if (!products[c.id]?.url) report.noCm.push(c.fullName);
    if (cmPart?.listings) {
      report.listings++;
      if (cmPart.listings.n < 10) report.thin.push(`${c.fullName} (${cmPart.listings.n})`);
    } else if (!cmPart?.guide?.trusted) report.untrusted.push(`${c.fullName} (trend €${cmPart?.guide?.trend ?? '—'} vs US €${usRawEur?.toFixed(0)})`);

    const image = await thumbnail(c.id, c.imageUrl);
    if (!image) report.noImage.push(c.id);
    cards.push({
      id: c.id,
      name: c.name,
      set: c.set,
      number: c.number,
      variant: c.variant,
      image,
      salesPerYear: c.pv.salesPerYear,
      links: {
        pricecharting: p?.url ?? null,
        cardmarket: products[c.id]?.url ?? `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(c.name)}`,
      },
      usd,
      cm: cmPart,
    });
  }

  const data = DataFile.parse({ version: 2, generatedAt: new Date().toISOString(), fx, defaults: { gradingFeeUsd: GRADING_FEE_USD }, cards });
  await writeJson(PATHS.out, data);

  const total = cards.length;
  const graded = cards.filter((c) => c.usd.psa10 && c.usd.g9).length / total;
  const mapped = 1 - report.noCm.length / total;
  const withBaseline = cards.filter((c) => c.cm?.listings || c.cm?.guide?.trusted).length;
  console.log(`\nQuality report: ${total} cards`);
  console.log(`  Grade 9 + PSA 10 prices:       ${(graded * 100).toFixed(0)}%   (PokeViews fallback: ${report.pcFallback.join(', ') || 'none'})`);
  console.log(`  Matched to Cardmarket:         ${(mapped * 100).toFixed(0)}%   missing: ${report.noCm.join(', ') || 'none'}`);
  console.log(`  NM English listings fetched:   ${report.listings}/${total}${report.thin.length ? `   fewer than 10: ${report.thin.join(', ')}` : ''}`);
  console.log(`  Raw baseline available:        ${withBaseline}/${total}`);
  if (suspicious.length) console.log(`  Listings dropped as likely wrong product: ${suspicious.join('; ')}`);
  console.log(`  No listings and no usable trend: ${report.untrusted.length}`);
  for (const u of report.untrusted) console.log(`    · ${u}`);
  console.log(`  Images: ${total - report.noImage.length}/${total}   $1 = €${fx.usdToEur} (${fx.date}) → ${PATHS.out}`);

  if (total === 0 || graded < MIN_GRADED_SHARE || mapped < MIN_CM_SHARE) {
    console.error(`\nData quality below threshold (graded prices ≥ ${MIN_GRADED_SHARE * 100}%, Cardmarket match ≥ ${MIN_CM_SHARE * 100}%).`);
    process.exit(1);
  }
}
