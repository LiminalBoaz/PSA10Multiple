// Step 4: the cheapest Near Mint English listings per card on Cardmarket.
// Cardmarket blocks cloud servers, so this runs Apify's "Cardmarket listings scraper" actor
// (phantom_coder/cardmarket-listings-scraper), which reads the live offer table. Needs APIFY_TOKEN.
//
//   npm run data:cardmarket                 EU-wide, every card not fetched in the last 20 h
//   npm run data:cardmarket -- --nl         also Netherlands-only (one extra paid run per card)
//   npm run data:cardmarket -- <card-id …>  just these cards
import { CardmarketFile, ContendersFile, PATHS, PriceChartingFile, readJson, writeJson, type CmEntry, type Contender } from './lib/files.ts';
import { CmProductsFile } from './cmproducts.ts';

const ACTOR = 'phantom_coder~cardmarket-listings-scraper';
const API = 'https://api.apify.com/v2';
const MAX_AGE_H = 20;
const CONCURRENCY = 3;
const MAX_RESULTS = 10;
/** Listings above this multiple of the US raw price are almost always graded slabs; not fetching them saves credit. */
const PRICE_CAP_X = 3.5;
/** Stop before the account's monthly limit is hit. */
const STOP_AT_USD = Number(process.env.APIFY_STOP_AT_USD ?? 4.9);
/** The actor's free-plan price per returned listing; Apify's usage figure lags, so we also count locally. */
const USD_PER_LISTING = 0.005;

interface ApifyListing {
  cardName?: string;
  price?: number;
  condition?: string;
  language?: string;
  sellerComment?: string | null;
  productUrl?: string;
}

export function actorInput(productUrl: string, c: Pick<Contender, 'variant'>, opts: { sellerCountry?: string; maxPrice?: number } = {}): Record<string, unknown> {
  const v = c.variant?.toLowerCase() ?? '';
  return {
    productUrl,
    minCondition: 'NM',
    language: 'English',
    maxResults: MAX_RESULTS,
    enableFairValue: false,
    ...(v.includes('1st') ? { isFirstEd: true } : {}),
    ...(opts.sellerCountry ? { sellerCountry: opts.sellerCountry } : {}),
    ...(opts.maxPrice ? { maxPrice: Math.ceil(opts.maxPrice) } : {}),
  };
}

const auth = () => {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw Object.assign(new Error('Set APIFY_TOKEN to fetch Cardmarket listings'), { fatal: true });
  return { authorization: `Bearer ${token}` };
};

export async function usageUsd(): Promise<{ used: number; limit: number }> {
  const r = await fetch(`${API}/users/me/limits`, { headers: auth() });
  const d = ((await r.json()) as { data: { limits: { maxMonthlyUsageUsd: number }; current: { monthlyUsageUsd: number } } }).data;
  return { used: d.current.monthlyUsageUsd, limit: d.limits.maxMonthlyUsageUsd };
}

async function runActor(input: Record<string, unknown>): Promise<ApifyListing[]> {
  const res = await fetch(`${API}/acts/${ACTOR}/run-sync-get-dataset-items?timeout=280`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth() },
    body: JSON.stringify(input),
  });
  if (res.status === 401 || res.status === 403 || res.status === 402) {
    throw Object.assign(new Error(`Apify refused the run (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`), { fatal: true });
  }
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
  const args = process.argv.slice(2);
  const withNl = args.includes('--nl');
  const only = args.filter((a) => !a.startsWith('--'));
  const { cards } = await readJson(PATHS.contenders, ContendersFile);
  const products = await readJson('data/cmproducts.json', CmProductsFile, {});
  const pc = await readJson(PATHS.pricecharting, PriceChartingFile, {});
  const out = await readJson(PATHS.cardmarket, CardmarketFile, {});
  const fresh = (id: string) => out[id] && Date.now() - Date.parse(out[id]!.fetchedAt) < MAX_AGE_H * 3600_000;
  // Biggest PSA 10 upside first, so a tight budget covers the cards worth hunting.
  const todo = cards
    .filter((c) => products[c.id]?.url && (only.length ? only.includes(c.id) : !fresh(c.id)))
    .sort((a, b) => b.pv.psa10 - b.pv.raw - (a.pv.psa10 - a.pv.raw));
  const start = await usageUsd();
  console.log(`${todo.length} cards to fetch${withNl ? ' (EU + NL)' : ' (EU)'}; Apify usage $${start.used.toFixed(2)} of $${start.limit}`);

  let next = 0;
  let done = 0;
  let stop = false;
  let spent = 0;
  async function worker() {
    while (!stop && next < todo.length) {
      const c = todo[next++]!;
      const projected = Math.max(start.used + spent, done % 6 === 0 ? (await usageUsd()).used : 0) + MAX_RESULTS * USD_PER_LISTING * (withNl ? 2 : 1);
      if (projected >= STOP_AT_USD) {
        stop = true;
        console.warn(`Stopping: Apify spend would pass $${STOP_AT_USD} (≈ $${(start.used + spent).toFixed(2)} so far).`);
        break;
      }
      const url = products[c.id]!.url!;
      const usRaw = pc[c.id]?.usd.raw ?? c.pv.raw;
      const maxPrice = usRaw * PRICE_CAP_X; // EUR cap; USD→EUR is < 1, so this errs on the generous side
      try {
        const eu = await runActor(actorInput(url, c, { maxPrice }));
        const nl = withNl ? await runActor(actorInput(url, c, { maxPrice, sellerCountry: 'NL' })) : [];
        spent += (eu.length + nl.length) * USD_PER_LISTING;
        const prev = out[c.id];
        out[c.id] = {
          productUrl: url,
          listings: toListings(eu, null),
          nlListings: withNl ? toListings(nl, 'Netherlands') : prev?.nlListings ?? [],
          nlFetchedAt: withNl ? new Date().toISOString() : prev?.nlFetchedAt ?? null,
          fetchedAt: new Date().toISOString(),
          cardName: eu[0]?.cardName ?? null,
        };
        const l = out[c.id]!.listings;
        console.log(`${++done}/${todo.length} ${c.fullName} [${eu[0]?.cardName ?? 'no listings'}]: ${l.length} NM EN ≤ €${maxPrice.toFixed(0)}, cheapest €${l[0]?.price ?? '—'}`);
      } catch (e) {
        console.warn(`${++done}/${todo.length} ${c.fullName}: ${(e as Error).message}`);
        if ((e as { fatal?: boolean }).fatal) stop = true;
      }
      await writeJson(PATHS.cardmarket, out);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const end = await usageUsd();
  console.log(`Apify usage now $${end.used.toFixed(2)} (this run ≈ $${(end.used - start.used).toFixed(2)})`);
}
