// Finds the Cardmarket product page for a PriceCharting card.
// Order: hand-made override → pokemontcg.io (which links each card to its Cardmarket idProduct).
import { z } from 'zod';
import { PATHS, readJson, type Contender } from './lib/files.ts';
import { getJson } from './lib/http.ts';

const Overrides = z.record(z.string(), z.url());

interface PtcgCard {
  id: string;
  name: string;
  number: string;
  set: { name: string; series: string };
  cardmarket?: { url?: string };
}

const norm = (s: string) => s.toLowerCase().replace(/^pokemon\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();

let overrides: Record<string, string> | null = null;

export async function cardmarketUrl(c: Contender): Promise<{ url: string | null; via: string }> {
  overrides ??= await readJson(PATHS.overrides, Overrides, {});
  if (overrides[c.id]) return { url: overrides[c.id]!, via: 'override' };
  if (!c.number) return { url: null, via: 'no card number' };

  const num = c.number.replace(/^0+/, '');
  const name = c.name.replace(/"/g, '');
  const q = encodeURIComponent(`name:"${name}" number:${num}`);
  const res = await getJson<{ data: PtcgCard[] }>(`https://api.pokemontcg.io/v2/cards?q=${q}&select=id,name,number,set,cardmarket`, { maxAgeH: 24 * 7, paceMs: 300 });
  const want = norm(c.set);
  const hit = res.data.find((d) => norm(d.set.name) === want) ?? res.data.find((d) => want.includes(norm(d.set.name)) || norm(d.set.name).includes(want));
  if (!hit?.cardmarket?.url) return { url: null, via: `pokemontcg: ${res.data.length} candidates, no set match for "${c.set}"` };

  // prices.pokemontcg.io/cardmarket/<id> redirects to the Cardmarket product page.
  const r = await fetch(hit.cardmarket.url, { redirect: 'manual' });
  const loc = r.headers.get('location');
  if (!loc || !loc.includes('cardmarket.com')) return { url: null, via: `pokemontcg redirect missing (${r.status})` };
  const u = new URL(loc);
  u.search = ''; // filters are added per request
  return { url: u.toString(), via: `pokemontcg ${hit.id}` };
}
