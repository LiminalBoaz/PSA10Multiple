// Step 3: match each card to its Cardmarket product via TCGdex, which links every printing to its
// Cardmarket idProduct and TCGplayer productId, and carries Cardmarket's daily price guide.
import { ContendersFile, normSet, PATHS, readJson, sameNumber, TcgdexFile, writeJson, type Contender, type TcgdexEntry } from './lib/files.ts';
import { getJson } from './lib/http.ts';

const API = 'https://api.tcgdex.net/v2/en';

interface SetBrief { id: string; name: string }
interface SetFull extends SetBrief { abbreviation?: { official?: string }; releaseDate?: string; cards: { id: string; localId: string; name: string }[] }
interface CmPrice { idProduct?: number; trend?: number | null; low?: number | null; avg30?: number | null; 'trend-holo'?: number | null; 'low-holo'?: number | null; 'avg30-holo'?: number | null }
interface Variant { type: string; thirdParty?: { cardmarket?: number; tcgplayer?: number }; pricing?: { cardmarket?: CmPrice; tcgplayer?: Record<string, { productId?: number; marketPrice?: number | null } | string> } }
interface CardFull { id: string; localId: string; name: string; image?: string; set: SetBrief; variants_detailed?: Variant[]; pricing?: { cardmarket?: CmPrice } }

const SET_ALIASES: Record<string, string[]> = {
  promo: ['basep', 'np', 'dpp', 'hgssp', 'bwp', 'xyp', 'smp', 'swshp', 'svp', 'mep', 'miscp', 'wp'],
  go: ['swsh10.5'],
  'scarlet and violet 151': ['sv03.5'],
  celebrations: ['cel25', 'cel25cc'],
};

const get = <T>(path: string) => getJson<T>(`${API}${path}`, { maxAgeH: 20, paceMs: 150 });
const normName = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '');

let allSets: SetBrief[] | null = null;
export async function candidateSets(c: Contender): Promise<string[]> {
  allSets ??= await get<SetBrief[]>('/sets');
  const want = normSet(c.set);
  if (SET_ALIASES[want]) return SET_ALIASES[want]!;
  const exact = allSets.filter((s) => normSet(s.name) === want).map((s) => s.id);
  // Subsets such as "Crown Zenith Galarian Gallery" or "Hidden Fates Shiny Vault".
  const sub = allSets.filter((s) => normSet(s.name).startsWith(`${want} `)).map((s) => s.id);
  return [...exact, ...sub];
}

/** Picks the printing that matches the PokeViews variant, preferring entries that carry a Cardmarket id. */
function pickVariant(card: CardFull, c: Contender): Variant | null {
  const all = card.variants_detailed ?? [];
  const withCm = all.filter((v) => v.thirdParty?.cardmarket || v.pricing?.cardmarket?.idProduct);
  const vs = withCm.length ? withCm : all;
  const byTp = c.tcgplayerId ? vs.find((v) => v.thirdParty?.tcgplayer === c.tcgplayerId) : undefined;
  if (byTp) return byTp;
  const want = c.variant?.toLowerCase() ?? '';
  const type = want.includes('1st') ? 'firstEdition' : want.includes('reverse') ? 'reverse' : null;
  const typed = type ? vs.find((v) => v.type === type) : vs.find((v) => v.type === 'holo') ?? vs.find((v) => v.type === 'normal');
  return (typed ?? vs[0]) ?? null;
}

function tcgplayerMarket(v: Variant): number | null {
  const tp = v.pricing?.tcgplayer ?? {};
  for (const val of Object.values(tp)) if (typeof val === 'object' && val?.marketPrice) return val.marketPrice;
  return null;
}

/** Cardmarket's guide mixes 1st Edition with Unlimited and lists reverse holos under "-holo". */
export function guideFor(cm: CmPrice | undefined, variant: string | null): TcgdexEntry['guide'] {
  if (!cm) return null;
  const v = variant?.toLowerCase() ?? '';
  if (v.includes('1st') || v.includes('shadowless')) return null;
  const pos = (n: number | null | undefined) => (n && n > 0 ? n : null);
  const g = v.includes('reverse')
    ? { trend: pos(cm['trend-holo']), low: pos(cm['low-holo']), avg30: pos(cm['avg30-holo']) }
    : { trend: pos(cm.trend), low: pos(cm.low), avg30: pos(cm.avg30) };
  return g.trend || g.low || g.avg30 ? g : null;
}

async function entryFor(cardId: string, c: Contender): Promise<{ entry: TcgdexEntry; tpMatch: boolean } | null> {
  const card = await get<CardFull>(`/cards/${encodeURIComponent(cardId)}`);
  const v = pickVariant(card, c);
  const idProduct = v?.thirdParty?.cardmarket ?? v?.pricing?.cardmarket?.idProduct ?? card.pricing?.cardmarket?.idProduct;
  if (!v || !idProduct) return null;
  const set = await get<SetFull>(`/sets/${encodeURIComponent(card.set.id)}`).catch(() => null);
  return {
    tpMatch: c.tcgplayerId != null && v.thirdParty?.tcgplayer === c.tcgplayerId,
    entry: {
      tcgdexId: card.id,
      setName: card.set.name,
      setCode: set?.abbreviation?.official ?? null,
      idProduct,
      guide: guideFor(v.pricing?.cardmarket ?? card.pricing?.cardmarket, c.variant),
      tcgplayerMarket: tcgplayerMarket(v),
      matchedBy: '',
      image: card.image ?? null,
      released: set?.releaseDate ?? null,
    },
  };
}

/**
 * 1. Same set and number → accept a TCGplayer-id match at once, else remember the first as a fallback.
 * 2. Same set, name only (sets that renumber, e.g. Celebrations Classic Collection) → TCGplayer-id match only.
 * 3. Any set, name and number → TCGplayer-id match only.
 */
export async function matchTcgdex(c: Contender): Promise<TcgdexEntry | null> {
  if (c.hints.tcgdex) {
    const r = await entryFor(c.hints.tcgdex, c).catch(() => null);
    if (r) return { ...r.entry, matchedBy: 'TCGdex id from the app' };
  }
  const want = normName(c.name);
  const nameOk = (n: string) => normName(n).startsWith(want.slice(0, 5)) || want.startsWith(normName(n).slice(0, 5));
  const inSets: { id: string; localId: string; name: string }[] = [];
  for (const setId of await candidateSets(c)) {
    const set = await get<SetFull>(`/sets/${encodeURIComponent(setId)}`).catch(() => null);
    for (const card of set?.cards ?? []) if (nameOk(card.name)) inSets.push(card);
  }

  let fallback: TcgdexEntry | null = null;
  const byNumber = inSets.filter((k) => (c.number ? sameNumber(k.localId, c.number) : true));
  for (const k of byNumber.slice(0, 8)) {
    const r = await entryFor(k.id, c);
    if (!r) continue;
    if (r.tpMatch) return { ...r.entry, matchedBy: 'tcgplayer id' };
    fallback ??= { ...r.entry, matchedBy: `set + number (${byNumber.length} candidate${byNumber.length > 1 ? 's' : ''})` };
  }
  if (!c.tcgplayerId) return fallback;

  for (const k of inSets.filter((k) => !byNumber.includes(k)).slice(0, 12)) {
    const r = await entryFor(k.id, c);
    if (r?.tpMatch) return { ...r.entry, matchedBy: 'tcgplayer id (renumbered set)' };
  }
  if (!fallback && c.number) {
    const found = await get<{ id: string; localId: string }[]>(`/cards?name=${encodeURIComponent(c.name)}&localId=${encodeURIComponent(c.number)}`).catch(() => []);
    for (const f of found.filter((f) => sameNumber(f.localId, c.number)).slice(0, 8)) {
      const r = await entryFor(f.id, c);
      if (r?.tpMatch) return { ...r.entry, matchedBy: 'tcgplayer id (other set)' };
    }
  }
  return fallback;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv.slice(2);
  const { cards } = await readJson(PATHS.contenders, ContendersFile);
  const out = await readJson(PATHS.tcgdex, TcgdexFile, {});
  const todo = cards.filter((c) => (only.length ? only.includes(c.id) : true));
  for (const [i, c] of todo.entries()) {
    const tag = `${i + 1}/${todo.length} ${c.fullName} (${c.set} #${c.number})`;
    try {
      const hit = await matchTcgdex(c);
      if (!hit) {
        delete out[c.id];
        console.warn(`✗ ${tag}: no TCGdex match`);
      } else {
        out[c.id] = hit;
        const g = hit.guide;
        console.log(`✓ ${tag} → ${hit.tcgdexId} [${hit.matchedBy}] CM#${hit.idProduct} trend €${g?.trend ?? '—'} low €${g?.low ?? '—'} | TCGP $${hit.tcgplayerMarket ?? '—'}`);
      }
    } catch (e) {
      console.warn(`✗ ${tag}: ${(e as Error).message}`);
    }
    await writeJson(PATHS.tcgdex, out);
  }
}
