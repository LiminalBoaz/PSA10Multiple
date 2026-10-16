// Adds a card by hand. Reads the "Add card" GitHub issue form (ISSUE_BODY) and appends the card to
// data/manual.json and data/contenders.json; the workflow then fetches its prices like any other card.
import { appendFile } from 'node:fs/promises';
import { z } from 'zod';
import { Contender as ContenderSchema, ContendersFile, PATHS, readJson, slug, splitVariant, writeJson, type Contender } from './lib/files.ts';

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
  if (!fullName || fullName.length > 80) throw new Error('Card name is missing or too long.');
  if (!set || set.length > 60) throw new Error('Set is missing or too long.');
  if (number && !/^[A-Za-z0-9-]{1,12}$/.test(number)) throw new Error(`Card number "${number}" looks wrong.`);
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
    hints: { pricecharting: url(f['pricecharting link'], 'pricecharting.com'), cardmarket: url(f['cardmarket link'], 'cardmarket.com') },
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const card = contenderFromForm(parseIssueForm(process.env.ISSUE_BODY ?? ''));
  const manual = await readJson(PATHS.manual, z.array(ContenderSchema), []);
  await writeJson(PATHS.manual, [...manual.filter((c) => c.id !== card.id), card]);
  const list = await readJson(PATHS.contenders, ContendersFile);
  if (!list.cards.some((c) => c.id === card.id)) list.cards.push(card);
  await writeJson(PATHS.contenders, list);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `id=${card.id}\nname=${card.fullName}\n`);
  console.log(`Added ${card.fullName} (${card.set} #${card.number ?? '—'}) as ${card.id}`);
}
