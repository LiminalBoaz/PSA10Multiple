/** Talks to GitHub with the personal token saved on this phone (only used to open "Add card" requests). */
export const REPO = import.meta.env.VITE_REPO || 'LiminalBoaz/PSA10Multiple';

export interface CardRequest {
  name: string;
  set: string;
  number: string;
  tcgdex?: string;
  pricecharting?: string;
  cardmarket?: string;
}

const title = (c: CardRequest) => `Add card: ${c.name} (${c.set}${c.number ? ` ${c.number}` : ''})`;

/** Same layout GitHub gives the "Add card" form, so the workflow reads both the same way. */
export function issueBody(c: CardRequest): string {
  const f = (label: string, v?: string) => `### ${label}\n\n${v?.trim() || '_No response_'}`;
  return [f('Card name', c.name), f('Set', c.set), f('Card number', c.number), f('TCGdex id', c.tcgdex), f('PriceCharting link', c.pricecharting), f('Cardmarket link', c.cardmarket)].join('\n\n');
}

/** GitHub's "new issue" page with the Add card form filled in (for phones without a saved token). */
export function issueFormUrl(c: CardRequest): string {
  const q = new URLSearchParams({ template: 'add-card.yml', title: title(c) });
  const fields: Record<string, string | undefined> = { name: c.name, set: c.set, number: c.number, tcgdex: c.tcgdex, pricecharting: c.pricecharting, cardmarket: c.cardmarket };
  for (const [k, v] of Object.entries(fields)) if (v?.trim()) q.set(k, v.trim());
  return `https://github.com/${REPO}/issues/new?${q}`;
}

const headers = (token: string) => ({ authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' });

/** Opens the request directly; the Add card workflow picks it up within seconds. */
export async function requestCard(token: string, c: CardRequest): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/issues`, { method: 'POST', headers: headers(token), body: JSON.stringify({ title: title(c), body: issueBody(c) }) });
  if (res.status === 401) throw new Error('GitHub didn’t accept the token. Check it in Settings.');
  if (res.status === 403 || res.status === 404) throw new Error('The token can’t open requests on this repository. It needs Issues: Read and write.');
  if (!res.ok) throw new Error(`GitHub answered ${res.status}. Try again in a moment.`);
}

/** True when the token can read this repository's requests. */
export async function checkToken(token: string): Promise<boolean> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/issues?per_page=1`, { headers: headers(token) }).catch(() => null);
  return Boolean(res?.ok);
}
