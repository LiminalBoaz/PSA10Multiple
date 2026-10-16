/** Parsed Cardmarket product URL: /en/Pokemon/Products/Singles/<Expansion>/<Name>[-V<n>]-<CODE><NUMBER> */
export interface CmSlug {
  url: string;
  expansion: string;
  version: number | null;
  code: string;
}

export function parseCmUrl(raw: string): CmSlug | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const m = u.pathname.match(/^\/en\/Pokemon\/Products\/Singles\/([^/]+)\/([^/]+)$/);
  if (!m) return null;
  const last = m[2]!;
  const code = last.split('-').pop() ?? '';
  const v = last.match(/-V(\d+)-[^-]+$/);
  return { url: `https://www.cardmarket.com${u.pathname}`, expansion: m[1]!, version: v ? Number(v[1]) : null, code };
}

/** "SKH31" ends with card number "H31"; "SIT138" with "138"; "SVP053" with "53". */
export function codeHasNumber(code: string, number: string | null): boolean {
  if (!number) return true;
  const n = number.toUpperCase().replace(/^([A-Z]*)0*(\d)/, '$1$2');
  const c = code.toUpperCase();
  const digits = n.match(/\d+$/)?.[0] ?? n;
  const prefix = n.slice(0, n.length - digits.length);
  // The number must follow the set code's letters, so "SIT1138" is not card 138.
  return new RegExp(`(^|[A-Z])${prefix}0*${digits}$`).test(c);
}
