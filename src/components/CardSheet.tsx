import { useEffect, useRef } from 'preact/hooks';
import type { DataFile } from '../../shared/schema.ts';
import type { Row } from '../lib/money.ts';
import { eur, signedEur, times, usd } from '../lib/format.ts';
import { CardImage } from './CardGrid.tsx';

interface Props {
  row: Row;
  data: DataFile;
  feeUsd: number;
  onClose: () => void;
}

/** English, Near Mint or better: the same filter the baseline is computed with. */
function withFilters(url: string, variant: string | null): string {
  const v = variant?.toLowerCase() ?? '';
  const extra = v.includes('1st') ? '&isFirstEd=Y' : v.includes('reverse') ? '&isReverseHolo=Y' : '';
  return `${url}${url.includes('?') ? '&' : '?'}language=1&minCondition=2${extra}`;
}

function Net({ v }: { v: number | null }) {
  if (v == null) return <td class="num muted">—</td>;
  return <td class={`num ${v >= 0 ? 'up' : 'down'}`}>{signedEur(v)}</td>;
}

export function CardSheet({ row, data, feeUsd, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const { card, a } = row;
  const cm = card.cm;
  const rate = data.fx.usdToEur;

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const grades = [
    { label: 'Grade 8', eur: a.g8, usd: card.usd.g8, net: a.net8 },
    { label: 'Grade 9', eur: a.g9, usd: card.usd.g9, net: a.net9 },
    { label: 'PSA 10', eur: a.psa10, usd: card.usd.psa10, net: a.net10 },
  ];
  const rawLabel = a.rawSource === 'listings' ? `${cm?.listings?.n} cheapest NM EN` : a.rawSource === 'trend' ? 'CM trend' : 'not available';

  return (
    <dialog
      ref={ref}
      class="sheet"
      aria-labelledby="sheet-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div class="sheet-body">
        <div class="sheet-head">
          <div class="sheet-art">
            <CardImage src={card.image} name={card.name} eager />
          </div>
          <div class="sheet-title">
            <h2 id="sheet-title">{card.name}</h2>
            <p class="sheet-set">
              {card.variant ? `${card.variant} · ` : ''}
              {card.set}
              {card.number ? ` #${card.number}` : ''}
            </p>
            <div class="maxbuy">
              <span class="label">Max buy · grade 9 safe</span>
              <span class="big">{eur(a.maxBuy9)}</span>
            </div>
            <p class="hint">Pay up to this and a grade 9 still breaks even after the {eur(a.fee)} grading fee.</p>
          </div>
        </div>

        <table class="ladder">
          <thead>
            <tr>
              <th scope="col">Grade</th>
              <th scope="col" class="num">Price</th>
              <th scope="col" class="num">After fee</th>
            </tr>
          </thead>
          <tbody>
            <tr class="raw-row">
              <th scope="row">
                Raw <small>{rawLabel}</small>
              </th>
              <td class="num">{eur(a.raw)}</td>
              <td class="num muted">you pay</td>
            </tr>
            {grades.map((g) => (
              <tr key={g.label}>
                <th scope="row">
                  <span class="grade">{g.label}</span>
                </th>
                <td class="num">
                  {eur(g.eur)}
                  <small>{usd(g.usd)}</small>
                </td>
                <Net v={g.net} />
              </tr>
            ))}
          </tbody>
        </table>

        <dl class="facts">
          <div>
            <dt>PSA 10 multiplier</dt>
            <dd>{times(a.multiplier)}</dd>
          </div>
          <div>
            <dt>Break-even if PSA 10</dt>
            <dd>{eur(a.maxBuy10)}</dd>
          </div>
          {card.salesPerYear != null && (
            <div>
              <dt>Sold per year (US)</dt>
              <dd>{card.salesPerYear}</dd>
            </div>
          )}
        </dl>

        <section class="cm" aria-labelledby="cm-h">
          <h3 id="cm-h">Cardmarket · Near Mint English</h3>
          {cm?.listings ? (
            <dl class="facts">
              <div>
                <dt>EU, {cm.listings.n} cheapest</dt>
                <dd>
                  avg {eur(cm.listings.avg10)} · median {eur(cm.listings.median)}
                </dd>
              </div>
              <div>
                <dt>Range</dt>
                <dd>
                  {eur(cm.listings.min)} – {eur(cm.listings.max)}
                </dd>
              </div>
              <div>
                <dt>Netherlands</dt>
                <dd>{a.nl ? `avg ${eur(a.nl.avg)} (${a.nl.n})` : 'Fewer than 3 listings'}</dd>
              </div>
            </dl>
          ) : (
            <p class="muted">Cheapest NM English listings not fetched yet.</p>
          )}
          {cm?.guide && (
            <dl class="facts">
              <div>
                <dt>CM trend · all languages</dt>
                <dd>{eur(cm.guide.trend)}</dd>
              </div>
              <div>
                <dt>Lowest · 30-day avg</dt>
                <dd>
                  {eur(cm.guide.low)} · {eur(cm.guide.avg30)}
                </dd>
              </div>
            </dl>
          )}
          {cm?.guide && !cm.guide.trusted && !cm.listings && (
            <p class="muted small">Trend is far from the US raw price, so it isn't used. Check the live listings.</p>
          )}
          {!cm && <p class="muted small">No Cardmarket product matched. Search Cardmarket directly.</p>}
          <dl class="facts">
            <div>
              <dt>US raw (PriceCharting)</dt>
              <dd>
                {usd(card.usd.raw)} <small>≈ {eur(card.usd.raw == null ? null : card.usd.raw * rate)}</small>
              </dd>
            </div>
          </dl>
        </section>

        <div class="links">
          <a href={withFilters(card.links.cardmarket, card.variant)} target="_blank" rel="noopener noreferrer">
            Cardmarket ↗
          </a>
          {card.links.pricecharting && (
            <a href={card.links.pricecharting} target="_blank" rel="noopener noreferrer">
              PriceCharting ↗
            </a>
          )}
        </div>

        <p class="fine">
          Grade 8 and 9 are PriceCharting sales across graders (mostly PSA); PSA 10 is PSA only. Fee ${feeUsd} ≈ {eur(a.fee)}. $1 = €
          {rate.toFixed(3)} ({data.fx.date}).
          {cm?.listings ? ` Listings checked ${new Date(cm.listings.fetchedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.` : ''}
        </p>

        <button type="button" class="close" onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  );
}
