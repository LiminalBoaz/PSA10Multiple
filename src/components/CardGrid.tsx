import type { Row } from '../lib/money.ts';
import { eur, signedEur } from '../lib/format.ts';

interface Props {
  rows: Row[];
  onOpen: (id: string) => void;
}

export function CardImage({ src, name, eager }: { src: string | null; name: string; eager?: boolean }) {
  return src ? (
    <img src={`${import.meta.env.BASE_URL}${src}`} alt={name} width={300} height={418} loading={eager ? 'eager' : 'lazy'} decoding="async" />
  ) : (
    <div class="noimg" aria-hidden="true">{name}</div>
  );
}

export function CardGrid({ rows, onOpen }: Props) {
  return (
    <ul class="grid">
      {rows.map(({ card, a }, i) => (
        <li key={card.id}>
          <button type="button" class="tile" onClick={() => onOpen(card.id)}>
            <div class="art">
              <CardImage src={card.image} name={card.name} eager={i < 6} />
            </div>
            <div class="tile-meta">
              <span class="tile-name">{card.name}</span>
              <span class="tile-set">
                {card.variant ? `${card.variant} · ` : ''}
                {card.set}
                {card.number ? ` #${card.number}` : ''}
              </span>
              <span class="tile-prices">
                <span class="raw">
                  {a.raw == null ? <span class="muted small">{card.cm?.checkedAt ? 'None on CM' : 'Check CM'}</span> : eur(a.raw)}
                  {a.rawSource === 'trend' && <span class="src">trend</span>}
                  {a.rawSource === 'listings' && card.cm?.listings && card.cm.listings.n < 10 && <span class="src">{card.cm.listings.n} listed</span>}
                </span>
                {a.net10 != null && <span class={a.net10 >= 0 ? 'pill up' : 'pill down'}>{signedEur(a.net10)}</span>}
              </span>
              {a.nineSafe && <span class="nine" title="A grade 9 still makes a profit">9 ✓</span>}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
