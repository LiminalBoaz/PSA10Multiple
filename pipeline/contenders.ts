// Step 1: the card list from PokeViews' grading-opportunity page.
// PokeViews builds its grid from PriceCharting data; each cell links a card's PriceCharting page.
import * as cheerio from 'cheerio';
import { PATHS, slug, writeJson, type Contender } from './lib/files.ts';
import { getText } from './lib/http.ts';

const SOURCE = 'https://www.pokeviews.com/grading_opportunity';
const NON_ENGLISH = /\b(japanese|chinese|korean|german|french|italian|spanish|portuguese)\b/i;

/** "Umbreon VMAX #215" → { name: "Umbreon VMAX", number: "215" } */
export function splitTitle(title: string): { name: string; number: string | null } {
  const m = title.trim().match(/^(.*?)\s*#\s*([A-Za-z0-9-]+)\s*$/);
  return m ? { name: m[1]!.trim(), number: m[2]! } : { name: title.trim(), number: null };
}

/** PriceCharting product URL: /game/pokemon-evolving-skies/umbreon-vmax-215 → set "Evolving Skies". */
export function setFromUrl(url: string): string {
  const seg = new URL(url).pathname.split('/')[2] ?? '';
  return seg
    .replace(/^pokemon-/, '')
    .split('-')
    .map((w) => (w.length <= 2 && w !== 'ex' ? w.toUpperCase() : w[0]!.toUpperCase() + w.slice(1)))
    .join(' ');
}

export function parseContenders(html: string): { cards: Contender[]; skipped: string[] } {
  const $ = cheerio.load(html);
  const seen = new Map<string, Contender>();
  const skipped: string[] = [];
  $('a[href*="pricecharting.com/game/"]').each((_, a) => {
    const href = $(a).attr('href')!;
    const url = new URL(href, SOURCE).toString();
    const set = setFromUrl(url);
    const title = $(a).attr('title') || $(a).find('img').attr('alt') || $(a).text();
    const { name, number } = splitTitle(title);
    if (!name) return;
    if (NON_ENGLISH.test(set) || NON_ENGLISH.test(url)) {
      skipped.push(`${name} (${set})`);
      return;
    }
    const id = slug(name, number);
    if (!seen.has(id)) seen.set(id, { id, name, set, number, pricechartingUrl: url });
  });
  return { cards: [...seen.values()], skipped };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const html = await getText(SOURCE, { maxAgeH: 6 });
  const { cards, skipped } = parseContenders(html);
  if (cards.length === 0) {
    throw new Error('No PriceCharting links found on PokeViews. The page may load its grid with JavaScript; check data/cache for the saved HTML.');
  }
  await writeJson(PATHS.contenders, { fetchedAt: new Date().toISOString(), source: SOURCE, skipped, cards });
  console.log(`${cards.length} English contenders, ${skipped.length} non-English skipped → ${PATHS.contenders}`);
}
