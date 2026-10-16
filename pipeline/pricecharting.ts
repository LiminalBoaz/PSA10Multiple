// Step 2: Grade 8, Grade 9 and PSA 10 prices (USD) from PriceCharting.
// PokeViews is built on PriceCharting, so the right product reproduces PokeViews' raw and PSA 10 prices.
// We search, open the likely candidates, and keep the one whose prices agree.
import * as cheerio from 'cheerio';
import { ContendersFile, PATHS, PriceChartingFile, readJson, writeJson, type Contender, type PcEntry } from './lib/files.ts';
import { getText } from './lib/http.ts';
import { parseUsd } from './lib/stats.ts';

const BASE = 'https://www.pricecharting.com';
const MAX_CANDIDATES = 4;
export const MAX_MISMATCH = 0.5;

export interface SearchRow {
  id: number;
  url: string;
  title: string;
  console: string;
}

export function parseSearch(html: string): SearchRow[] {
  const $ = cheerio.load(html);
  return $('tr[id^="product-"]')
    .map((_, tr) => {
      const a = $(tr).find('td.title a').first();
      return {
        id: Number($(tr).attr('data-product') ?? $(tr).attr('id')!.replace('product-', '')),
        url: new URL(a.attr('href') ?? '', BASE).toString(),
        title: a.text().replace(/\s+/g, ' ').trim(),
        console: $(tr).find('td.console').text().replace(/\s+/g, ' ').trim(),
      };
    })
    .get()
    .filter((r) => r.url.includes('/game/'));
}

export function parseProduct(html: string): { url: string | null; title: string; usd: PcEntry['usd'] } | null {
  const $ = cheerio.load(html);
  if (!$('#price_data').length) return null;
  const price = (id: string) => parseUsd($(`#${id} .js-price`).first().text());
  const h1 = $('#product_name');
  const title = `${h1.clone().children().remove().end().text().replace(/\s+/g, ' ').trim()} · ${h1.find('a').first().text().replace(/\s+/g, ' ').trim()}`;
  return {
    url: $('link[rel="canonical"]').attr('href') ?? null,
    title,
    // PriceCharting reuses its video-game price slots for card grades.
    usd: { raw: price('used_price'), g8: price('new_price'), g9: price('graded_price'), psa10: price('manual_only_price') },
  };
}

export function mismatch(usd: PcEntry['usd'], pv: Contender['pv']): number {
  const rel = (a: number | null, b: number) => (a == null ? 1 : Math.abs(a - b) / b);
  return (rel(usd.raw, pv.raw) + rel(usd.psa10, pv.psa10)) / 2;
}

const norm = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

/** The product's set must be the card's set (any promo set for "Promo"), and never a foreign-language set. */
export function setMatches(productTitle: string, c: Contender): boolean {
  const set = norm(productTitle.split(' · ').pop() ?? '');
  if (/\b(japanese|chinese|korean|german|french|italian|spanish)\b/.test(set)) return false;
  return c.set === 'Promo' ? set.includes('promo') : set.includes(norm(c.set));
}

/** Orders search rows so the likeliest products are opened first. */
export function rankRows(rows: SearchRow[], c: Contender): SearchRow[] {
  const score = (r: SearchRow) => {
    if (c.pricechartingId && r.id === c.pricechartingId) return -100;
    let s = 0;
    const t = norm(r.title);
    if (c.number && !new RegExp(`#\\s*0*${c.number.replace(/^([A-Za-z]*)0*/, '$1')}\\b`, 'i').test(r.title.replace(/#\s*([A-Za-z]*)0*/, '#$1'))) s += 10;
    if (c.variant ? !t.includes(norm(c.variant)) : /\[/.test(r.title)) s += 3;
    if (c.set !== 'Promo' && !norm(r.console).includes(norm(c.set))) s += 2;
    if (!t.startsWith(norm(c.name))) s += 1;
    return s;
  };
  return [...rows].sort((a, b) => score(a) - score(b));
}

async function search(q: string): Promise<{ rows: SearchRow[]; direct: ReturnType<typeof parseProduct> }> {
  const html = await getText(`${BASE}/search-products?q=${encodeURIComponent(q)}&type=prices`, { paceMs: 1500 });
  return { rows: parseSearch(html), direct: parseProduct(html) };
}

export async function findOnPriceCharting(c: Contender): Promise<PcEntry | null> {
  const queries = [
    [c.name, c.number, c.set === 'Promo' ? 'promo' : c.set],
    [c.name, c.variant, c.number],
    [c.name, c.set === 'Promo' ? 'promo' : c.set],
  ].map((parts) => parts.filter(Boolean).join(' '));

  let best: PcEntry | null = null;
  for (const q of queries) {
    const { rows, direct } = await search(q);
    const pages: { url: string; html?: string }[] = direct?.url ? [{ url: direct.url }] : rankRows(rows, c).slice(0, MAX_CANDIDATES).map((r) => ({ url: r.url }));
    for (const p of pages) {
      const prod = parseProduct(await getText(p.url, { paceMs: 1500 }));
      if (!prod || !setMatches(prod.title, c)) continue;
      const m = mismatch(prod.usd, c.pv);
      if (!best || m < best.mismatch) best = { url: prod.url ?? p.url, title: prod.title, usd: prod.usd, mismatch: Math.round(m * 1000) / 1000, fetchedAt: new Date().toISOString() };
      if (m < 0.05) return best;
    }
    if (best && best.mismatch <= MAX_MISMATCH) return best;
  }
  return best;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv.slice(2);
  const { cards } = await readJson(PATHS.contenders, ContendersFile);
  const out = await readJson(PATHS.pricecharting, PriceChartingFile, {});
  const todo = cards.filter((c) => (only.length ? only.includes(c.id) : true));
  for (const [i, c] of todo.entries()) {
    const tag = `${i + 1}/${todo.length} ${c.fullName} (${c.set} #${c.number})`;
    try {
      const hit = await findOnPriceCharting(c);
      if (!hit) {
        console.warn(`✗ ${tag}: no PriceCharting product`);
        continue;
      }
      out[c.id] = hit;
      const flag = hit.mismatch <= MAX_MISMATCH ? '✓' : '?';
      console.log(`${flag} ${tag} → ${hit.title} | raw $${hit.usd.raw} g8 $${hit.usd.g8} g9 $${hit.usd.g9} psa10 $${hit.usd.psa10} | off ${(hit.mismatch * 100).toFixed(0)}%`);
    } catch (e) {
      console.warn(`✗ ${tag}: ${(e as Error).message}`);
    }
    await writeJson(PATHS.pricecharting, out);
  }
}
