import { getJson } from './http.ts';

/** USD→EUR reference rate from the European Central Bank (via frankfurter). */
export async function usdToEur(): Promise<{ usdToEur: number; date: string }> {
  const r = await getJson<{ date: string; rates: { EUR: number } }>('https://api.frankfurter.app/latest?from=USD&to=EUR', { maxAgeH: 6 });
  if (!(r.rates?.EUR > 0)) throw new Error('No EUR rate in frankfurter response');
  return { usdToEur: r.rates.EUR, date: r.date };
}
