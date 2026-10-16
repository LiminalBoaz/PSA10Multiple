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

function withFilters(url: string): string {
  // English, Near Mint or better: the same filter the baseline was computed with.
  return `${url}${url.includes('?') ? '&' : '?'}language=1&minCondition=2`;
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
    { label: 'PSA 8', eur: a.psa8, usd: card.usd.psa8, net: a.net8 },
    { label: 'PSA 9', eur: a.psa9, usd: card.usd.psa9, net: a.net9 },
    { label: 'PSA 10', eur: a.psa10, usd: card.usd.psa10, net: a.net10 },
  ];

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
              {card.set}
              {card.number ? ` · #${card.number}` : ''}
            </p>
            <div class="maxbuy">
              <span class="label">Max buy · PSA 9 safe</span>
              <span class="big">{eur(a.maxBuy9)}</span>
            </div>
            <p class="hint">Pay up to this and a PSA 9 still breaks even after the {eur(a.fee)} grading fee.</p>
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
                Raw <small>Cardmarket</small>
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
        </dl>

        <section class="cm" aria-labelledby="cm-h">
          <h3 id="cm-h">Cardmarket · Near Mint English</h3>
          {cm ? (
            <dl class="facts">
              <div>
                <dt>EU, {cm.n} cheapest</dt>
                <dd>
                  avg {eur(cm.avg10)} · median {eur(cm.median)}
                </dd>
              </div>
              <div>
                <dt>Range</dt>
                <dd>
                  {eur(cm.min)} – {eur(cm.max)}
                </dd>
              </div>
              <div>
                <dt>Netherlands</dt>
                <dd>{a.nl ? `avg ${eur(a.nl.avg)} (${a.nl.n})` : 'Fewer than 3 listings'}</dd>
              </div>
              <div>
                <dt>US raw (PriceCharting)</dt>
                <dd>
                  {usd(card.usd.raw)} <small>≈ {eur(card.usd.raw == null ? null : card.usd.raw * rate)}</small>
                </dd>
              </div>
            </dl>
          ) : (
            <p class="muted">No Near Mint English listings found on Cardmarket.</p>
          )}
        </section>

        <div class="links">
          {card.links.cardmarket && (
            <a href={withFilters(card.links.cardmarket)} target="_blank" rel="noopener noreferrer">
              Cardmarket ↗
            </a>
          )}
          <a href={card.links.pricecharting} target="_blank" rel="noopener noreferrer">
            PriceCharting ↗
          </a>
        </div>

        <p class="fine">
          Fee ${feeUsd} ≈ {eur(a.fee)}. $1 = €{rate.toFixed(3)} ({data.fx.date}).
          {cm ? ` Cardmarket checked ${new Date(cm.fetchedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.` : ''}
        </p>

        <button type="button" class="close" onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  );
}
