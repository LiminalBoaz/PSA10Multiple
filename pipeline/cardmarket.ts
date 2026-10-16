// Step 3: the cheapest Near Mint English listings per card on Cardmarket, EU-wide and Netherlands-only.
// Uses a real browser (Cardmarket sits behind Cloudflare). If Cloudflare blocks this, the Apify adapter takes over.
import { chromium, type Page } from '@playwright/test';
import { CardmarketFile, ContendersFile, PATHS, readJson, writeJson, type CmEntry } from './lib/files.ts';
import { cardmarketUrl } from './map.ts';
import { pace } from './lib/http.ts';
import { parseEuro, type Listing } from './lib/stats.ts';

const FILTER = 'language=1&minCondition=2'; // English, Near Mint or better
const NL_SELLER_COUNTRY = 23; // Cardmarket's id for the Netherlands
const MAX_AGE_H = 20;

async function listings(page: Page, url: string): Promise<Listing[]> {
  await pace(5000);
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  if (res?.status() === 403 || (await page.title()).toLowerCase().includes('just a moment')) {
    throw Object.assign(new Error('Blocked by Cloudflare'), { blocked: true });
  }
  await page.waitForSelector('.article-row, .table-body .row, .noResults', { timeout: 20_000 }).catch(() => {});
  return page.$$eval('.article-row', (rows) =>
    rows.map((row) => {
      const price = row.querySelector('.price-container .color-primary, .price-container span')?.textContent ?? '';
      const loc = row.querySelector('[aria-label^="Item location"], [data-bs-original-title^="Item location"], [title^="Item location"]');
      const label = loc?.getAttribute('aria-label') ?? loc?.getAttribute('data-bs-original-title') ?? loc?.getAttribute('title') ?? '';
      return { priceText: price, country: label.replace(/^Item location:\s*/, '') || null };
    }),
  ).then((rows) => rows.flatMap((r) => (parseEuro(r.priceText) ? [{ price: parseEuro(r.priceText)!, country: r.country }] : [])));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv.slice(2); // optional card ids, e.g. for the 3-card spike
  const { cards } = await readJson(PATHS.contenders, ContendersFile);
  const out = await readJson(PATHS.cardmarket, CardmarketFile, {});
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  const page = await (await browser.newContext({ locale: 'en-GB' })).newPage();
  const todo = cards.filter((c) => (only.length ? only.includes(c.id) : true));
  try {
    for (const [i, c] of todo.entries()) {
      const prev = out[c.id];
      if (!only.length && prev && Date.now() - Date.parse(prev.fetchedAt) < MAX_AGE_H * 3600_000) continue;
      const tag = `${i + 1}/${todo.length} ${c.id}`;
      try {
        const { url, via } = await cardmarketUrl(c);
        if (!url) {
          out[c.id] = { productUrl: null, listings: [], nlListings: [], fetchedAt: new Date().toISOString(), note: via };
          console.warn(`${tag}: not mapped (${via})`);
          continue;
        }
        const eu = await listings(page, `${url}?${FILTER}`);
        const nl = await listings(page, `${url}?${FILTER}&sellerCountry=${NL_SELLER_COUNTRY}`);
        const entry: CmEntry = { productUrl: url, listings: eu.slice(0, 20), nlListings: nl.slice(0, 20), fetchedAt: new Date().toISOString(), note: via };
        out[c.id] = entry;
        console.log(`${tag}: ${eu.length} EU / ${nl.length} NL listings, cheapest €${eu[0]?.price ?? '—'}`);
      } catch (e) {
        console.warn(`${tag}: ${(e as Error).message}`);
        if ((e as { blocked?: boolean }).blocked) throw e;
      } finally {
        await writeJson(PATHS.cardmarket, out);
      }
    }
  } finally {
    await browser.close();
  }
}
