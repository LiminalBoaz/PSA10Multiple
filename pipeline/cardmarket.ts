// Step 4: the cheapest Near Mint English listings per card on Cardmarket, EU-wide and Netherlands-only.
// Cardmarket blocks cloud servers, so this runs Apify's "Cardmarket listings scraper" actor, which reads
// the live offer table through residential proxies. Needs APIFY_TOKEN.
import { CardmarketFile, ContendersFile, PATHS, readJson, TcgdexFile, writeJson, type CmEntry, type Contender } from './lib/files.ts';

const ACTOR = 'phantom_coder~cardmarket-listings-scraper';
const MAX_AGE_H = 20;
const CONCURRENCY = 4;
/** Fetch more than 10 so listings dropped as slabs (from seller comments) still leave 10. */
const MAX_RESULTS = 20;

interface ApifyListing {
  price?: number;
  condition?: string;
  language?: string;
  sellerComment?: string | null;
  productUrl?: string;
}

export function actorInput(productUrl: string, c: Pick<Contender, 'variant'>, sellerCountry?: string): Record<string, unknown> {
  const v = c.variant?.toLowerCase() ?? '';
  return {
    productUrl,
    minCondition: 'NM',
    language: 'English',
    maxResults: MAX_RESULTS,
    enableFairValue: false,
    ...(v.includes('1st') ? { isFirstEd: true } : {}),
    ...(sellerCountry ? { sellerCountry } : {}),
  };
}

async function runActor(input: Record<string, unknown>): Promise<ApifyListing[]> {
  const token = process.env.APIFY_TOKEN;
  const url = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?timeout=240${token ? `&token=${token}` : ''}`;
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error('Apify rejected the request: set APIFY_TOKEN'), { fatal: true });
  if (!res.ok) throw new Error(`Apify HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as ApifyListing[];
}

function toListings(rows: ApifyListing[], country: string | null): CmEntry['listings'] {
  return rows
    .filter((r) => typeof r.price === 'number' && r.price > 0 && (r.language ?? 'English') === 'English')
    .map((r) => ({ price: r.price!, country, comment: r.sellerComment ?? null }))
    .sort((a, b) => a.price - b.price);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv.slice(2);
  const { cards } = await readJson(PATHS.contenders, ContendersFile);
  const td = await readJson(PATHS.tcgdex, TcgdexFile, {});
  const out = await readJson(PATHS.cardmarket, CardmarketFile, {});
  const fresh = (id: string) => out[id] && Date.now() - Date.parse(out[id]!.fetchedAt) < MAX_AGE_H * 3600_000;
  const todo = cards.filter((c) => td[c.id] && (only.length ? only.includes(c.id) : !fresh(c.id)));
  console.log(`${todo.length} cards to fetch (${cards.length - todo.length} skipped: fresh or not on Cardmarket)`);

  let next = 0;
  let done = 0;
  async function worker() {
    while (next < todo.length) {
      const c = todo[next++]!;
      const url = `https://www.cardmarket.com/en/Pokemon/Products?idProduct=${td[c.id]!.idProduct}`;
      try {
        const [eu, nl] = await Promise.all([runActor(actorInput(url, c)), runActor(actorInput(url, c, 'NL'))]);
        out[c.id] = { productUrl: eu[0]?.productUrl ?? url, listings: toListings(eu, null), nlListings: toListings(nl, 'Netherlands'), fetchedAt: new Date().toISOString() };
        console.log(`${++done}/${todo.length} ${c.fullName}: ${eu.length} EU / ${nl.length} NL, cheapest €${out[c.id]!.listings[0]?.price ?? '—'}`);
      } catch (e) {
        console.warn(`${++done}/${todo.length} ${c.fullName}: ${(e as Error).message}`);
        if ((e as { fatal?: boolean }).fatal) process.exit(1);
      }
      await writeJson(PATHS.cardmarket, out);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}
