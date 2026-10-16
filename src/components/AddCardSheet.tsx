import { useState } from 'preact/hooks';
import { slug } from '../../shared/slug.ts';
import type { PendingCard } from '../lib/prefs.ts';
import { Sheet } from './Sheet.tsx';

const REPO = import.meta.env.VITE_REPO || 'LiminalBoaz/PSA10Multiple';

interface Props {
  pending: PendingCard[];
  onSubmitted: (p: PendingCard) => void;
  onForget: (id: string) => void;
  onClose: () => void;
}

/** GitHub's "new issue" page with the Add card form already filled in. */
export function issueUrl(f: { name: string; set: string; number: string; pricecharting: string; cardmarket: string }): string {
  const q = new URLSearchParams({ template: 'add-card.yml', title: `Add card: ${f.name} (${f.set}${f.number ? ` ${f.number}` : ''})` });
  for (const [k, v] of Object.entries(f)) if (v.trim()) q.set(k, v.trim());
  return `https://github.com/${REPO}/issues/new?${q}`;
}

function ago(ms: number): string {
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? 'just now' : `${m} min ago`;
}

export function AddCardSheet({ pending, onSubmitted, onForget, onClose }: Props) {
  const [f, setF] = useState({ name: '', set: '', number: '', pricecharting: '', cardmarket: '' });
  const ready = f.name.trim().length > 1 && f.set.trim().length > 1;
  const field = (key: keyof typeof f, label: string, placeholder: string, optional = false) => (
    <label class="field" for={`add-${key}`}>
      <span>
        {label}
        {optional && <small> optional</small>}
      </span>
      <input
        id={`add-${key}`}
        type={key === 'pricecharting' || key === 'cardmarket' ? 'url' : 'text'}
        autoComplete="off"
        autoCapitalize={key === 'name' || key === 'set' ? 'words' : 'off'}
        placeholder={placeholder}
        value={f[key]}
        onInput={(e) => setF({ ...f, [key]: (e.currentTarget as HTMLInputElement).value })}
      />
    </label>
  );

  return (
    <Sheet title="Add a card" onClose={onClose}>
      <div class="panel form">
        {field('name', 'Card name', 'e.g. Umbreon VMAX')}
        {field('set', 'Set', 'e.g. Evolving Skies')}
        {field('number', 'Card number', 'e.g. 215')}
        {field('pricecharting', 'PriceCharting link', 'Paste a link', true)}
        {field('cardmarket', 'Cardmarket link', 'Paste a link', true)}
        {ready ? (
          <a
            class="pill-btn primary wide"
            href={issueUrl(f)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              onSubmitted({ id: slug(f.name.trim(), f.set.trim(), f.number.trim().replace(/^#/, '') || null), name: f.name.trim(), set: f.set.trim(), number: f.number.trim(), at: Date.now() });
              setF({ name: '', set: '', number: '', pricecharting: '', cardmarket: '' });
            }}
          >
            Fetch prices
          </a>
        ) : (
          <button type="button" class="pill-btn primary wide" disabled>
            Fetch prices
          </button>
        )}
        <p class="hint">Opens GitHub with the card filled in. Tap “Create”, and the card shows up here with its prices in about 5 minutes.</p>
      </div>

      {pending.length > 0 && (
        <section class="panel">
          <h3 class="panel-title">Fetching prices</h3>
          <ul class="list">
            {pending.map((p) => (
              <li key={p.id}>
                <span>
                  {p.name}
                  <small>
                    {' '}
                    {p.set}
                    {p.number ? ` · ${p.number}` : ''} · {ago(p.at)}
                  </small>
                </span>
                <button type="button" class="pill-btn" onClick={() => onForget(p.id)}>
                  Stop waiting
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Sheet>
  );
}
