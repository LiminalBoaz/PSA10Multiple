// Adds cards by hand. Each request is an "Add card: …" GitHub issue, opened by the app (one tap) or
// through the GitHub form. This step reads every open request, adds the cards to data/manual.json and
// data/contenders.json, and lists what it did for the workflow to fetch prices and report back.
//
//   npx tsx pipeline/addcard.ts <issues.json from the GitHub API> <added.json to write>
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { pcSetName } from '../shared/sets.ts';
import { Contender as ContenderSchema, ContendersFile, PATHS, readJson, slug, splitVariant, writeJson, type Contender } from './lib/files.ts';
import { getJson } from './lib/http.ts';

/** GitHub renders issue forms as "### Label\n\nvalue" blocks; empty fields read "_No response_". */
export function parseIssueForm(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = body.replace(/\r\n/g, '\n').split(/^###\s+/m).slice(1);
  for (const part of parts) {
    const [label = '', ...rest] = part.split('\n');
    const value = rest.join('\n').trim();
    out[label.trim().toLowerCase()] = value === '_No response_' ? '' : value;
  }
  return out;
}

const url = (v: string | undefined, host: string) => {
  if (!v) return undefined;
  try {
    const u = new URL(v.trim());
    return u.hostname.endsWith(host) ? u.toString() : undefined;
  } catch {
    return undefined;
  }
};

export function contenderFromForm(f: Record<string, string>): Contender {
  const fullName = (f['card name'] ?? '').replace(/\s+/g, ' ').trim();
  const set = (f['set'] ?? '').replace(/\s+/g, ' ').trim();
  const number = (f['card number'] ?? '').replace(/^#/, '').trim() || null;
  const tcgdex = (f['tcgdex id'] ?? '').trim() || undefined;
  if (!fullName || fullName.length > 80) throw new Error('Card name is missing or too long.');
  if (!set || set.length > 60) throw new Error('Set is missing or too long.');
  if (number && !/^[A-Za-z0-9-]{1,12}$/.test(number)) throw new Error(`Card number "${number}" looks wrong.`);
  if (tcgdex && !/^[A-Za-z0-9.-]{1,40}$/.test(tcgdex)) throw new Error(`TCGdex id "${tcgdex}" looks wrong.`);
  const { name, variant } = splitVariant(fullName);
  return ContenderSchema.parse({
    id: slug(fullName, set, number),
    name,
    fullName,
    variant,
    set,
    series: '',
    number,
    imageUrl: null,
    tcgplayerId: null,
    pricechartingId: null,
    pv: null,
    added: true,
    hints: { pricecharting: url(f['pricecharting link'], 'pricecharting.com'), cardmarket: url(f['cardmarket link'], 'cardmarket.com'), tcgdex },
  });
}

/** Fills name, set and number from TCGdex when the request only carries a TCGdex id. */
export async function resolveForm(f: Record<string, string>): Promise<Record<string, string>> {
  const id = (f['tcgdex id'] ?? '').trim();
  if (!id || (f['card name'] && f['set'])) return f;
  const card = await getJson<{ name: string; localId: string; set: { name: string } }>(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(id)}`, { maxAgeH: 24 });
  return { ...f, 'card name': f['card name'] || card.name, set: f['set'] || pcSetName(card.set.name), 'card number': f['card number'] || card.localId };
}

const Issue = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  author_association: z.string(),
  pull_request: z.unknown().optional(),
});
const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

export interface Added {
  issue: number;
  id?: string;
  name?: string;
  error?: string;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [issuesFile, addedFile] = process.argv.slice(2);
  if (!issuesFile || !addedFile) throw new Error('usage: addcard.ts <issues.json> <added.json>');
  const issues = z
    .array(Issue)
    .parse(JSON.parse(await readFile(issuesFile, 'utf8')))
    .filter((i) => !i.pull_request && /^add card/i.test(i.title) && TRUSTED.has(i.author_association));

  const manual = await readJson(PATHS.manual, z.array(ContenderSchema), []);
  const list = await readJson(PATHS.contenders, ContendersFile);
  const added: Added[] = [];
  for (const issue of issues) {
    try {
      const card = contenderFromForm(await resolveForm(parseIssueForm(issue.body ?? '')));
      const i = manual.findIndex((c) => c.id === card.id);
      if (i >= 0) manual[i] = card;
      else manual.push(card);
      if (!list.cards.some((c) => c.id === card.id)) list.cards.push(card);
      added.push({ issue: issue.number, id: card.id, name: `${card.fullName} (${card.set}${card.number ? ` ${card.number}` : ''})` });
      console.log(`#${issue.number}: ${card.fullName} · ${card.set} · ${card.number ?? '—'} → ${card.id}`);
    } catch (e) {
      added.push({ issue: issue.number, error: (e as Error).message });
      console.warn(`#${issue.number}: ${(e as Error).message}`);
    }
  }
  await writeJson(PATHS.manual, manual);
  await writeJson(PATHS.contenders, list);
  await writeFile(addedFile, JSON.stringify(added));
  const ids = [...new Set(added.flatMap((a) => (a.id ? [a.id] : [])))];
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `ids=${ids.join(' ')}\ncount=${added.length}\n`);
  console.log(`${ids.length} card(s) to fetch, ${added.length - ids.length} request(s) with problems`);
}
