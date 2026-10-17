/**
 * The set name PriceCharting uses for a TCGdex set: subsets fold into their main set
 * ("Silver Tempest Trainer Gallery" → "Silver Tempest") and every black star promo set is "Promo".
 * Shared by the app (to predict a new card's id) and the data pipeline.
 */
export function pcSetName(tcgdexSet: string): string {
  const s = tcgdexSet.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim();
  if (/promo/i.test(s)) return 'Promo';
  if (/^pokemon go$/i.test(s)) return 'Go';
  return s.replace(/:?\s+(Trainer Gallery|Galarian Gallery|Shiny Vault|Classic Collection|Radiant Collection)$/i, '').trim();
}
