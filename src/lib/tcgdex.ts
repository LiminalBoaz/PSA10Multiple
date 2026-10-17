/** Card search for "Add a card", straight from TCGdex (English cards, CORS-enabled). */
const API = 'https://api.tcgdex.net/v2/en';

export interface FoundCard {
  id: string;
  name: string;
  number: string;
  setName: string;
  image: string | null;
}

let sets: Promise<Map<string, { name: string; order: number }>> | null = null;
function loadSets() {
  sets ??= fetch(`${API}/sets`)
    .then((r) => r.json() as Promise<{ id: string; name: string }[]>)
    .then((list) => new Map(list.map((s, i) => [s.id, { name: s.name, order: i }])))
    .catch((e) => {
      sets = null;
      throw e;
    });
  return sets;
}

/** Cards whose name contains the query, newest sets first. */
export async function searchCards(query: string, signal?: AbortSignal): Promise<FoundCard[]> {
  const [setMap, cards] = await Promise.all([
    loadSets(),
    fetch(`${API}/cards?name=${encodeURIComponent(query.trim())}`, { signal }).then((r) => (r.ok ? (r.json() as Promise<{ id: string; localId: string; name: string; image?: string }[]>) : [])),
  ]);
  return cards
    .map((c) => {
      const setId = c.id.slice(0, c.id.length - c.localId.length - 1);
      const set = setMap.get(setId);
      return { card: { id: c.id, name: c.name, number: c.localId, setName: set?.name ?? setId, image: c.image ? `${c.image}/low.webp` : null }, order: set?.order ?? -1 };
    })
    .sort((a, b) => b.order - a.order)
    .slice(0, 40)
    .map((x) => x.card);
}
