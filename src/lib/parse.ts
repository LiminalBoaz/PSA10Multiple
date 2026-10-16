/** Reads a euro amount typed on a phone: "12,50", "12.50", "€ 1.234,50", "1,234.50". null when empty or invalid. */
export function parseEuroInput(text: string): number | null {
  let s = text.replace(/[€\s]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? Math.round(n * 100) / 100 : null;
}
