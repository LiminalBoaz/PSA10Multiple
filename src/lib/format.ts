const eur0 = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** €12.40 below €100, €125 from €100 up. Dash when missing. */
export function eur(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return Math.abs(n) < 100 ? eur2.format(n) : eur0.format(n);
}

/** "€25" for whole amounts, "€22.50" otherwise: for settings like the fee. */
export function eurPlain(n: number): string {
  return Number.isInteger(n) ? eur0.format(n) : eur2.format(n);
}

/** "16 Oct". */
export function dayMonth(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function usd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return Math.abs(n) < 100 ? usd2.format(n) : usd0.format(n);
}

/** +€85 / −€12.40, with a real minus sign. */
export function signedEur(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const s = eur(Math.abs(n));
  return n >= 0 ? `+${s}` : `−${s}`;
}

export function times(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n < 10 ? n.toFixed(1) : Math.round(n)}×`;
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
