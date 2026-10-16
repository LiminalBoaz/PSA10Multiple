import { useState } from 'preact/hooks';
import type { Card } from '../../shared/schema.ts';
import { eur } from '../lib/format.ts';
import { parseEuroInput } from '../lib/parse.ts';
import { Sheet } from './Sheet.tsx';

interface Props {
  feeEur: number;
  defaultFeeEur: number;
  hidden: Card[];
  myPriceCount: number;
  onFee: (eur: number) => void;
  onRestore: (id: string) => void;
  onClearPrices: () => void;
  onClose: () => void;
}

export function SettingsSheet({ feeEur, defaultFeeEur, hidden, myPriceCount, onFee, onRestore, onClearPrices, onClose }: Props) {
  const [draft, setDraft] = useState(String(feeEur).replace('.', ','));
  const parsed = draft.trim() === '0' ? 0 : parseEuroInput(draft);
  return (
    <Sheet title="Settings" onClose={onClose}>
      <form
        class="panel"
        onSubmit={(e) => {
          e.preventDefault();
          if (parsed != null) onFee(parsed);
        }}
      >
        <label for="fee" class="panel-title">
          Grading cost per card
        </label>
        <div class="row">
          <span class="euro">€</span>
          <input id="fee" type="text" inputMode="decimal" enterKeyHint="done" value={draft} onInput={(e) => setDraft((e.currentTarget as HTMLInputElement).value)} />
          <button type="submit" class="pill-btn primary" disabled={parsed == null || parsed === feeEur}>
            Save
          </button>
        </div>
        <p class="hint">
          PSA fee plus your share of shipping. Used in every profit and max-buy number.{' '}
          {feeEur !== defaultFeeEur && (
            <button
              type="button"
              class="link"
              onClick={() => {
                setDraft(String(defaultFeeEur));
                onFee(defaultFeeEur);
              }}
            >
              Reset to {eur(defaultFeeEur)}
            </button>
          )}
        </p>
      </form>

      <section class="panel">
        <h3 class="panel-title">Removed cards</h3>
        {hidden.length === 0 ? (
          <p class="hint">None. Remove a card from its detail page; it stays removed on this phone.</p>
        ) : (
          <ul class="list">
            {hidden.map((c) => (
              <li key={c.id}>
                <span>
                  {c.name}
                  <small>
                    {' '}
                    {c.set}
                    {c.number ? ` · ${c.number}` : ''}
                  </small>
                </span>
                <button type="button" class="pill-btn" onClick={() => onRestore(c.id)}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {myPriceCount > 0 && (
        <section class="panel">
          <h3 class="panel-title">Your prices</h3>
          <div class="row spread">
            <span class="hint">
              {myPriceCount} {myPriceCount === 1 ? 'card uses' : 'cards use'} your own price.
            </span>
            <button type="button" class="pill-btn" onClick={onClearPrices}>
              Clear all
            </button>
          </div>
        </section>
      )}
    </Sheet>
  );
}
