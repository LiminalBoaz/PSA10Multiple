import { useEffect, useRef, useState } from 'preact/hooks';
import type { DataFile } from '../../shared/schema.ts';
import type { Row } from '../lib/money.ts';
import { eur, eurPlain, signedEur, times, usd } from '../lib/format.ts';
import { parseEuroInput } from '../lib/parse.ts';
import { CardImage } from './CardGrid.tsx';

interface Props {
  row: Row;
  data: DataFile;
  myPrice: number | null;
  onSetMyPrice: (eur: number | null) => void;
  onHide: () => void;
  onClose: () => void;
}

/** Cardmarket link with the same filters the price uses: English, Near Mint or better. */
function cardmarketUrl(url: string, variant: string | null): string {
  if (url.includes('/Search?')) return url;
  const v = variant?.toLowerCase() ?? '';
  const extra = v.includes('1st') ? '&isFirstEd=Y' : v.includes('reverse') ? '&isReverseHolo=Y' : '';
  return `${url}${url.includes('?') ? '&' : '?'}language=1&minCondition=2${extra}`;
}

function rawSourceText(row: Row): string {
  const { a, card } = row;
  const l = card.cm?.listings;
  if (a.rawSource === 'mine') return 'Your price';
  if (a.rawSource === 'listings' && l) return l.n >= 10 ? 'Average of the 10 cheapest Near Mint English copies on Cardmarket' : `Average of the ${l.n === 1 ? 'only' : l.n} Near Mint English ${l.n === 1 ? 'copy' : 'copies'} on Cardmarket`;
  if (a.rawSource === 'estimate') return 'Cardmarket estimate (live listings not checked yet)';
  return card.cm?.checkedAt ? 'No Near Mint English copy for sale on Cardmarket' : 'No Cardmarket price yet';
}

export function CardDetail({ row, data, myPrice, onSetMyPrice, onHide, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const { card, a } = row;
  const cm = card.cm;
  const rate = data.fx.usdToEur;
  const [draft, setDraft] = useState(myPrice != null ? String(myPrice).replace('.', ',') : '');
  const parsed = parseEuroInput(draft);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    // Always open at the top, with focus on "back" (focusing a lower control would scroll the page down).
    scroller.current?.scrollTo(0, 0);
    back.current?.focus({ preventScroll: true });
  }, [card.id]);

  const grades = [
    { label: 'Grade 8', eur: a.g8, usd: card.usd.g8, net: a.net8 },
    { label: 'Grade 9', eur: a.g9, usd: card.usd.g9, net: a.net9 },
    { label: 'PSA 10', eur: a.psa10, usd: card.usd.psa10, net: a.net10 },
  ];

  return (
    <dialog
      ref={ref}
      class="detail"
      aria-labelledby="detail-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div class="detail-scroll" ref={scroller}>
        <header class="detail-bar glass">
          <button type="button" class="back" ref={back} onClick={onClose}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            Cards
          </button>
          <nav class="ext">
            <a href={cardmarketUrl(card.links.cardmarket, card.variant)} target="_blank" rel="noopener noreferrer">
              Cardmarket ↗
            </a>
            {card.links.pricecharting && (
              <a href={card.links.pricecharting} target="_blank" rel="noopener noreferrer">
                PriceCharting ↗
              </a>
            )}
          </nav>
        </header>

        <div class="detail-body">
          <section class="hero">
            <div class="hero-art">
              <CardImage src={card.image} name={card.name} eager />
            </div>
            <div class="hero-text">
              <h2 id="detail-title">{card.name}</h2>
              <p class="meta">
                {card.set}
                {card.number ? ` · ${card.number}` : ''}
                {card.variant ? ` · ${card.variant}` : ''}
              </p>
              <div class="stat">
                <span class="stat-label">Raw price</span>
                <span class="stat-value">{eur(a.raw)}</span>
                <span class="stat-note">{rawSourceText(row)}</span>
              </div>
              <div class="stat">
                <span class="stat-label">Profit if PSA 10</span>
                <span class={`stat-value ${a.net10 == null ? '' : a.net10 >= 0 ? 'up' : 'down'}`}>{signedEur(a.net10)}</span>
                <span class="stat-note">{a.multiplier ? `${times(a.multiplier)} the raw price` : ' '}</span>
              </div>
            </div>
          </section>

          <section class="maxbuy">
            <span class="stat-label">Max buy</span>
            {a.maxBuy9 != null && a.maxBuy9 > 0 ? (
              <>
                <span class="maxbuy-value">{eur(a.maxBuy9)}</span>
                <span class="stat-note">Pay at most this and a grade 9 still breaks even after the {eurPlain(a.fee)} fee.</span>
              </>
            ) : (
              <>
                <span class="maxbuy-value muted">Only for a 10</span>
                <span class="stat-note">{a.maxBuy9 == null ? 'No grade 9 sales to go on.' : `A grade 9 sells for less than the ${eurPlain(a.fee)} fee.`}</span>
              </>
            )}
          </section>

          <table class="ladder">
            <thead>
              <tr>
                <th scope="col">If it grades</th>
                <th scope="col" class="num">Sells for</th>
                <th scope="col" class="num">You make</th>
              </tr>
            </thead>
            <tbody>
              {grades.map((g) => (
                <tr key={g.label}>
                  <th scope="row">
                    <span class="grade">{g.label}</span>
                  </th>
                  <td class="num">
                    {eur(g.eur)}
                    <small>{usd(g.usd)}</small>
                  </td>
                  <td class={`num ${g.net == null ? 'muted' : g.net >= 0 ? 'up' : 'down'}`}>{signedEur(g.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <form
            class="panel myprice"
            onSubmit={(e) => {
              e.preventDefault();
              if (parsed != null) onSetMyPrice(parsed);
              (document.activeElement as HTMLElement | null)?.blur();
            }}
          >
            <label for="myprice" class="panel-title">
              Your price
            </label>
            <div class="row">
              <span class="euro">€</span>
              <input
                id="myprice"
                type="text"
                inputMode="decimal"
                enterKeyHint="done"
                autoComplete="off"
                placeholder={a.rawSource === 'mine' ? '' : a.raw != null ? eur(a.raw).replace('€', '') : 'e.g. 45'}
                value={draft}
                onInput={(e) => setDraft((e.currentTarget as HTMLInputElement).value)}
              />
              <button type="submit" class="pill-btn primary" disabled={parsed == null || parsed === myPrice}>
                {myPrice != null ? 'Update' : 'Use'}
              </button>
            </div>
            <p class="hint">
              {myPrice != null ? (
                <>
                  Using your price on this phone.{' '}
                  <button
                    type="button"
                    class="link"
                    onClick={() => {
                      setDraft('');
                      onSetMyPrice(null);
                    }}
                  >
                    Use Cardmarket price again
                  </button>
                </>
              ) : (
                'Saw a different price at the booth or on Cardmarket? Enter it to recalculate. Saved on this phone.'
              )}
            </p>
          </form>

          <section class="panel">
            <h3 class="panel-title">Cardmarket · Near Mint English</h3>
            <dl class="facts">
              {cm?.listings ? (
                <>
                  <div>
                    <dt>{cm.listings.n} cheapest</dt>
                    <dd>
                      {eur(cm.listings.min)} – {eur(cm.listings.max)}
                    </dd>
                  </div>
                  <div>
                    <dt>Average · median</dt>
                    <dd>
                      {eur(cm.listings.avg10)} · {eur(cm.listings.median)}
                    </dd>
                  </div>
                  <div>
                    <dt>Netherlands only</dt>
                    <dd>{a.nl ? `${eur(a.nl.avg)} (${a.nl.n})` : cm.listings.nlChecked ? 'Under 3 copies' : 'Not checked'}</dd>
                  </div>
                </>
              ) : (
                <div>
                  <dt>Live listings</dt>
                  <dd>{cm?.checkedAt ? 'None for sale' : 'Not checked yet'}</dd>
                </div>
              )}
              {cm?.guide?.trend != null && (
                <div>
                  <dt>Cardmarket estimate</dt>
                  <dd>{eur(cm.guide.trend)}</dd>
                </div>
              )}
              <div>
                <dt>US raw (PriceCharting)</dt>
                <dd>
                  {usd(card.usd.raw)} <small>≈ {eur(card.usd.raw == null ? null : card.usd.raw * rate)}</small>
                </dd>
              </div>
              {card.salesPerYear != null && (
                <div>
                  <dt>US sales per year</dt>
                  <dd>{card.salesPerYear}</dd>
                </div>
              )}
            </dl>
            {card.cmNote && <p class="warn">{card.cmNote}</p>}
          </section>

          <button type="button" class="remove" onClick={onHide}>
            Remove from my list
          </button>

          <p class="fine">
            Grade 8 and 9 are PriceCharting sales across grading companies; PSA 10 is PSA only. $1 = €{rate.toFixed(3)}.
            {cm?.checkedAt ? ` Cardmarket checked ${new Date(cm.checkedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.` : ''}
          </p>
        </div>
      </div>
    </dialog>
  );
}
