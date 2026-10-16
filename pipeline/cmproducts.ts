// Step 3b: the exact Cardmarket product page for every card, in Cardmarket's own URL format
// (/en/Pokemon/Products/Singles/<Set>/<Name>-V<n>-<CODE><NUMBER>).
// pokemontcg.io redirects each card to that page. We check the card number in the URL, then map the
// version (V1, V2, …) back to Cardmarket's idProduct with the public catalogue, which also gives the trend.
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { ContendersFile, normSet, PATHS, readJson, sameNumber, TcgdexFile, writeJson, type Contender } from './lib/files.ts';
import { getJson, readCache, writeCache } from './lib/http.ts';
import { loadCatalog, type Catalog } from './lib/cmcatalog.ts';
import { codeHasNumber, parseCmUrl } from './lib/slug.ts';

export const CmProduct = z.object({
  url: z.url().nullable(),
  idProduct: z.number().int().nullable(),
  /** How the product was established, and whether TCGdex agreed. */
  via: z.string(),
});
export const CmProductsFile = z.record(z.string(), CmProduct);
export type CmProduct = z.infer<typeof CmProduct>;

interface PtcgCard { id: string; name: string; number: string; set: { name: string; series: string }; cardmarket?: { url?: string } }

const normName = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '');

async function ptcgSearch(q: string): Promise<PtcgCard[]> {
  const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&select=id,name,number,set,cardmarket`;
  for (let i = 0; i < 4; i++) {
    try {
      return (await getJson<{ data: PtcgCard[] }>(url, { maxAgeH: 24 * 7, paceMs: 400 })).data;
    } catch (e) {
      if (i === 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  return [];
}

/** Finds the pokemontcg.io card for a contender, matching set name (or any promo set) and number. */
async function findPtcg(c: Contender, tcgdexSet: string | null): Promise<PtcgCard | null> {
  if (!c.number) return null;
  const num = c.number.replace(/^([A-Za-z]*)0+(\d)/, '$1$2');
  const want = normName(c.name);
  const found = await ptcgSearch(`number:"${num}" name:"${c.name.replace(/"/g, '')}*"`).catch(() => []);
  const byName = found.length ? found : await ptcgSearch(`number:"${num}"`).then((r) => r.filter((x) => normName(x.name).startsWith(want.slice(0, 5))));
  const sets = [c.set, tcgdexSet].filter(Boolean).map((s) => normSet(s!));
  const setOk = (p: PtcgCard) => {
    const s = normSet(p.set.name);
    return c.set === 'Promo' ? /promo/.test(s) : sets.some((w) => s === w || s.startsWith(`${w} `) || w.startsWith(`${s} `) || s.replace(/^celebrations classic collection/, 'celebrations') === w);
  };
  return byName.find((p) => setOk(p) && sameNumber(p.number, c.number)) ?? null;
}

async function redirectTarget(url: string): Promise<string | null> {
  const cached = await readCache(`redirect:${url}`, 24 * 30, 'txt');
  if (cached != null) return cached || null;
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { redirect: 'manual' }).catch(() => null);
    if (r && r.status >= 300 && r.status < 400) {
      const loc = r.headers.get('location') ?? '';
      await writeCache(`redirect:${url}`, loc, 'txt');
      return loc || null;
    }
    await new Promise((res) => setTimeout(res, 1500));
  }
  return null;
}

export function productFromVersion(cat: Catalog, anchorId: number, version: number | null): number | null {
  const vs = cat.versions(anchorId);
  if (vs.length === 0) return null;
  if (version == null) return vs.length === 1 ? vs[0]! : null;
  return vs[version - 1] ?? null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv.slice(2);
  const { cards } = await readJson(PATHS.contenders, ContendersFile);
  const td = await readJson(PATHS.tcgdex, TcgdexFile, {});
  const out = await readJson('data/cmproducts.json', CmProductsFile, {});
  const overrides = z.record(z.string(), z.string()).parse(JSON.parse(await readFile('data/cm-urls.json', 'utf8')));
  const cat = await loadCatalog();
  for (const [i, c] of cards.filter((c) => !only.length || only.includes(c.id)).entries()) {
    const t = td[c.id];
    const tag = `${i + 1} ${c.fullName} (${c.set} #${c.number})`;
    const manual = overrides[c.id];
    if (manual) {
      // Confirmed by hand. Keep TCGdex's id only for the trend, and only when it is the sole version.
      const single = t && cat.versions(t.idProduct).length === 1;
      out[c.id] = { url: manual, idProduct: single ? t.idProduct : null, via: 'confirmed on Cardmarket (data/cm-urls.json)' };
      console.log(`✓ ${tag}: ${manual} [manual]`);
      await writeJson('data/cmproducts.json', out);
      continue;
    }
    const p = await findPtcg(c, t?.setName ?? null);
    const loc = p?.cardmarket?.url ? await redirectTarget(p.cardmarket.url) : null;
    const slug = loc ? parseCmUrl(loc) : null;
    if (slug && !codeHasNumber(slug.code, c.number)) {
      out[c.id] = { url: null, idProduct: t?.idProduct ?? null, via: `pokemontcg URL has wrong number (${slug.code})` };
      console.warn(`? ${tag}: ${slug.url} does not carry #${c.number}`);
    } else if (slug) {
      const fromSlug = t ? productFromVersion(cat, t.idProduct, slug.version) : null;
      const agree = fromSlug != null && fromSlug === t?.idProduct;
      // Cardmarket numbers versions by card number, so the URL's V<n> and TCGdex's id can only confirm
      // each other when they line up. When they don't, the trend is left out rather than guessed.
      const single = t != null && slug.version == null && cat.versions(t.idProduct).length === 1;
      out[c.id] = {
        url: slug.url,
        idProduct: agree || single ? t!.idProduct : null,
        via: !t ? 'pokemontcg URL (no TCGdex id)' : agree || single ? 'pokemontcg URL + TCGdex agree' : `pokemontcg URL; TCGdex id ${t.idProduct} not confirmed`,
      };
      console.log(`${agree ? '✓' : '~'} ${tag}: ${slug.url} → ${out[c.id]!.idProduct} [${out[c.id]!.via}]`);
    } else {
      out[c.id] = { url: null, idProduct: t?.idProduct ?? null, via: p ? 'pokemontcg has no Cardmarket link' : 'not on pokemontcg.io' };
      console.warn(`✗ ${tag}: ${out[c.id]!.via}`);
    }
    await writeJson('data/cmproducts.json', out);
  }
}
