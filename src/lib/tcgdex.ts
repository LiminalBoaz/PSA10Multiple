/** Card search for "Add a card", straight from TCGdex (English cards, CORS-enabled). */
const API = 'https://api.tcgdex.net/v2/en';

export interface FoundCard {
  id: string;
  name: string;
  number: string;
  setName: string;
  image: string | null;
}

interface Brief {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** "raichu 211", "raichu #211/193", "umbreon vmax tg23", "mew ex paldea" → name words, set words and a card number. */
export function parseQuery(q: string): { words: string[]; number: string | null } {
  const tokens = fold(q).replace(/[^a-z0-9#/ -]+/g, ' ').split(/\s+/).filter(Boolean);
  let number: string | null = null;
  const words: string[] = [];
  for (const t of tokens) {
    const m = t.match(/^#?([a-z]{0,5}\d{1,4}[a-z]?)(?:\/\d+)?$/);
    if (m && /\d/.test(m[1]!) && number == null) number = m[1]!;
    else words.push(t.replace(/^#/, ''));
  }
  return { words, number };
}

/** Same card number, ignoring case and leading zeros: "053" = "53", "tg05" = "TG5". */
export function sameNumber(a: string, b: string): boolean {
  const n = (s: string) => s.toUpperCase().replace(/^([A-Z]*)0*(\d)/, '$1$2');
  return n(a) === n(b);
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

const byName = new Map<string, Promise<Brief[]>>();
function cardsNamed(name: string, signal?: AbortSignal): Promise<Brief[]> {
  const key = name.trim();
  if (!byName.has(key)) {
    byName.set(
      key,
      fetch(`${API}/cards?name=${encodeURIComponent(key)}`, { signal })
        .then((r) => (r.ok ? (r.json() as Promise<Brief[]>) : []))
        .catch((e) => {
          byName.delete(key);
          throw e;
        }),
    );
  }
  return byName.get(key)!;
}

/**
 * Cards matching the query, newest sets first. The name is matched by TCGdex; words the name doesn't
 * cover must appear in the set name, and a number must be the card number. "raichu paldea 211" works.
 */
export async function searchCards(query: string, signal?: AbortSignal): Promise<FoundCard[]> {
  const { words, number } = parseQuery(query);
  const setMap = await loadSets();
  const toFound = (c: Brief) => {
    const setId = c.id.endsWith(`-${c.localId}`) ? c.id.slice(0, c.id.length - c.localId.length - 1) : c.id.slice(0, c.id.lastIndexOf('-'));
    const set = setMap.get(setId);
    return { card: { id: c.id, name: c.name, number: c.localId, setName: set?.name ?? setId, image: c.image ? `${c.image}/low.webp` : null }, order: set?.order ?? -1 };
  };

  const attempt = async (nameWords: string[], num: string | null) => {
    // Use the longest run of leading words that TCGdex knows as a name; the rest must be in the set name.
    for (let k = nameWords.length; k >= 1; k--) {
      const found = await cardsNamed(nameWords.slice(0, k).join(' '), signal);
      if (!found.length) continue;
      const rest = nameWords.slice(k);
      return found
        .map(toFound)
        .filter(({ card }) => rest.every((w) => fold(`${card.setName} ${card.name}`).includes(w)))
        .filter(({ card }) => !num || sameNumber(card.number, num));
    }
    return [];
  };

  let hits = words.length ? await attempt(words, number) : [];
  // A bare number like "151" may be a set name rather than a card number.
  if (!hits.length && number && /^\d+$/.test(number) && words.length) hits = await attempt([...words, number], null);
  return hits
    .sort((a, b) => b.order - a.order)
    .slice(0, 80)
    .map((x) => x.card);
}
