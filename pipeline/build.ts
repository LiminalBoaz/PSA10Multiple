// Step 5: merge PokeViews + PriceCharting + TCGdex/Cardmarket into public/cards.json, make thumbnails,
// print a quality report, and refuse to publish data that is too thin to trust.
import sharp from 'sharp';
import { z } from 'zod';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { DataFile, type Card } from '../shared/schema.ts';
import { CardmarketFile, ContendersFile, PATHS, PriceChartingFile, readJson, TcgdexFile, writeJson, type CmEntry, type TcgdexEntry } from './lib/files.ts';
import { usdToEur } from './lib/fx.ts';
import { pace } from './lib/http.ts';
import { cheapestStats, type Listing } from './lib/stats.ts';
import { MAX_MISMATCH } from './pricecharting.ts';
import { CmProductsFile, type CmProduct } from './cmproducts.ts';
import { sameNumber } from './lib/files.ts';

const GRADING_FEE_EUR = 25; // default; adjustable in the app
/** Cardmarket's trend stands in for the listings only when it is this close to the US raw price. */
export const TREND_BAND = [0.5, 2] as const;
/** Listings this far from the US raw price suggest the wrong Cardmarket product (another version of the card). */
export const LISTINGS_BAND = [0.33, 3] as const;
const MIN_GRADED_SHARE = 0.95;
const MIN_CM_SHARE = 0.8;

/** A grading company followed by a grade ("PSA 7", "bgs 8,5", "CGC NM/M+ 8.5", "PSA1"), unless it is "PSA 10 candidate". */
const GRADED = /\b(psa|bgs|cgc|sgc|gsg|pca|tag|ace|ags|beckett|gma|mnt)\s*[-:]?\s*(?:nm\/m\+?\s*|gem\s*mint\s*|mint\s*)?(?:10|[1-9])(?:[.,]5)?\b(?!\s*(?:candidate|worthy|potential|ready|material|quality))/i;
const SLAB_WORDS = /\b(graded|slabbed|slab|new cert|fresh cert)\b/i;
const DAMAGED = /\b(proxy|damaged|creased?|custom|fake|replica)\b/i;

/** True when the seller's comment says the copy is a graded slab or damaged, so not a plain raw card. */
export function notRaw(comment: string | null | undefined): boolean {
  const c = comment ?? '';
  return GRADED.test(c) || SLAB_WORDS.test(c) || DAMAGED.test(c);
}

export function rawOnly(listings: (Listing & { comment?: string | null })[]): Listing[] {
  return listings.filter((l) => !notRaw(l.comment));
}

/** Printings that share a Cardmarket page with other printings and can't be filtered there. */
export function variantNote(variant: string | null): string | null {
  const v = variant?.toLowerCase() ?? '';
  if (v.includes('shadowless')) return 'Cardmarket lists this card on one page for all Base Set printings, so these listings may include unlimited copies.';
  if (v.includes('reverse')) return 'Cardmarket can’t filter reverse holos here, so these listings may include the regular holo.';
  return null;
}

/** Flags EU prices far from the US raw price: usually a thin EU market, worth knowing at the booth. */
export function farFromUs(euAvg: number | null, usRawEur: number | null): string | null {
  if (!euAvg || !usRawEur) return null;
  const r = euAvg / usRawEur;
  if (r > 2.5) return `Cardmarket is ${r.toFixed(1)}× the US raw price: few copies are listed in Europe.`;
  if (r < 0.5) return `Cardmarket is under half the US raw price: check the copies before buying.`;
  return null;
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
  // A page whose title carries the card number is the right product even when EU prices are far from US ones.
  const numberConfirmed = Boolean(m?.cardName && /#\s*[A-Za-z]*\d+\s*$/.test(m.cardName));
  if (eu && m && !scrapedNumberMatches(m.cardName, number)) {
    suspicious.push(`${label} (page shows "${m.cardName}")`);
    eu = null;
  } else if (eu && !numberConfirmed && !listingsPlausible(eu.avg, usRawEur)) {
    suspicious.push(`${label} (listings €${eu.avg} vs US €${usRawEur?.toFixed(0)}, page has no card number)`);
    eu = null;
  }
  const nl = m && eu ? cheapestStats(rawOnly(m.nlListings).map((l) => l.price)) : null;
  const idProduct = prod?.idProduct ?? null;
  const guide = t?.guide && idProduct != null && idProduct === t.idProduct ? { ...t.guide, trusted: trendTrusted(t.guide.trend, usRawEur) } : null;
  return {
    idProduct,
    checkedAt: m?.fetchedAt ?? null,
    guide,
    listings:
      eu && m
        ? { avg10: eu.avg, median: eu.median, min: eu.min, max: eu.max, n: eu.n, nl: nl ? { avg: nl.avg, n: nl.n } : null, nlChecked: Boolean(m.nlFetchedAt), fetchedAt: m.fetchedAt }
        : null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const excluded = new Set(await readJson(PATHS.excluded, z.array(z.string()), []));
  const contenders = (await readJson(PATHS.contenders, ContendersFile)).cards.filter((c) => !excluded.has(c.id));
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
    const usd = p?.usd ?? { raw: c.pv?.raw ?? null, g8: null, g9: null, psa10: c.pv?.psa10 ?? null };
    if (!p) report.pcFallback.push(c.id);
    const usRawEur = usd.raw == null ? null : usd.raw * fx.usdToEur;
    const cmPart = cardmarketPart(products[c.id], td[c.id], cm[c.id], usRawEur, c.fullName, c.number);
    if (!products[c.id]?.url) report.noCm.push(c.fullName);
    if (cmPart?.listings) {
      report.listings++;
      if (cmPart.listings.n < 10) report.thin.push(`${c.fullName} (${cmPart.listings.n})`);
    } else if (!cmPart?.guide?.trusted) report.untrusted.push(`${c.fullName} (trend €${cmPart?.guide?.trend ?? '—'} vs US €${usRawEur?.toFixed(0)})`);

    const tdImage = td[c.id]?.image;
    const image = await thumbnail(c.id, c.imageUrl ?? (tdImage ? `${tdImage}/high.webp` : null));
    if (!image) report.noImage.push(c.id);
    cards.push({
      id: c.id,
      name: c.name,
      set: c.set,
      number: c.number,
      variant: c.variant,
      image,
      added: c.added,
      salesPerYear: c.pv?.salesPerYear ?? null,
      links: {
        pricecharting: p?.url ?? null,
        cardmarket: products[c.id]?.url ?? `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(c.name)}`,
      },
      usd,
      cm: cmPart,
      cmNote: [variantNote(c.variant), farFromUs(cmPart?.listings?.avg10 ?? null, usRawEur)].filter(Boolean).join(' ') || null,
    });
  }

  const md = [
    `# Data quality (${new Date().toISOString().slice(0, 10)})`,
    '',
    'Raw = mean of up to 10 cheapest Near Mint English Cardmarket listings (slabs and damaged copies removed). Ratio = raw ÷ US raw (PriceCharting, converted to EUR).',
    '',
    '| Card | Set | # | Raw € | Source | Listings | US raw € | Ratio | Grade 9 € | PSA 10 € | Note |',
    '| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |',
    ...cards.map((c) => {
      const raw = c.cm?.listings?.avg10 ?? (c.cm?.guide?.trusted ? c.cm.guide.trend : null);
      const src = c.cm?.listings ? 'listings' : raw ? 'CM trend' : '—';
      const us = c.usd.raw ? c.usd.raw * fx.usdToEur : null;
      const f = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(2));
      const name = `[${c.variant ? `${c.name} (${c.variant})` : c.name}](${c.links.cardmarket})`;
      return `| ${name} | ${c.set} | ${c.number ?? ''} | ${f(raw)} | ${src} | ${c.cm?.listings?.n ?? 0} | ${f(us)} | ${raw && us ? (raw / us).toFixed(2) : '—'} | ${f(c.usd.g9 ? c.usd.g9 * fx.usdToEur : null)} | ${f(c.usd.psa10 ? c.usd.psa10 * fx.usdToEur : null)} | ${c.cmNote ?? ''} |`;
    }),
    '',
    suspicious.length ? `Listings dropped as a likely wrong product: ${suspicious.join('; ')}` : '',
  ].join('\n');
  await writeFile('data/quality.md', `${md}\n`);

    // The date shown in the app: when the oldest PriceCharting prices were fetched, not when this file was built.
  const fetched = contenders.map((c) => pc[c.id]?.fetchedAt).filter((d): d is string => Boolean(d)).sort();
  const data = DataFile.parse({ version: 3, generatedAt: fetched[0] ?? new Date().toISOString(), fx, defaults: { gradingFeeEur: GRADING_FEE_EUR }, cards });
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
