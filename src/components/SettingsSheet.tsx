import { useState } from 'preact/hooks';
import type { Card } from '../../shared/schema.ts';
import { eur } from '../lib/format.ts';
import { parseEuroInput } from '../lib/parse.ts';
import { checkToken, REPO } from '../lib/github.ts';
import { Sheet } from './Sheet.tsx';

interface Props {
  feeEur: number;
  defaultFeeEur: number;
  hidden: Card[];
  myPriceCount: number;
  onFee: (eur: number) => void;
  onRestore: (id: string) => void;
  onClearPrices: () => void;
  token: string | null;
  onToken: (token: string | null) => void;
  onClose: () => void;
}

function TokenPanel({ token, onToken }: { token: string | null; onToken: (t: string | null) => void }) {
  const [draft, setDraft] = useState('');
  const [state, setState] = useState<'idle' | 'checking' | 'bad'>('idle');
  if (token) {
    return (
      <section class="panel">
        <h3 class="panel-title">One-tap adding</h3>
        <div class="row spread">
          <span class="hint">Connected to GitHub. “Add card” works in one tap.</span>
          <button type="button" class="pill-btn" onClick={() => onToken(null)}>
            Disconnect
          </button>
        </div>
      </section>
    );
  }
  return (
    <form
      class="panel"
      onSubmit={async (e) => {
        e.preventDefault();
        const t = draft.trim();
        if (!t) return;
        setState('checking');
        if (await checkToken(t)) {
          onToken(t);
          setDraft('');
          setState('idle');
        } else setState('bad');
      }}
    >
      <label for="gh-token" class="panel-title">
        One-tap adding
      </label>
      <p class="hint">
        Add cards without leaving the app. Once: create a{' '}
        <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">
          GitHub token
        </a>{' '}
        with access to only <b>{REPO.split('/')[1]}</b> and <b>Issues: Read and write</b>, then paste it here. It stays on this phone.
      </p>
      <div class="row">
        <input id="gh-token" type="password" autoComplete="off" placeholder="github_pat_…" value={draft} onInput={(e) => setDraft((e.currentTarget as HTMLInputElement).value)} />
        <button type="submit" class="pill-btn primary" disabled={!draft.trim() || state === 'checking'}>
          {state === 'checking' ? 'Checking…' : 'Connect'}
        </button>
      </div>
      {state === 'bad' && <p class="warn">That token can’t reach {REPO}. Check the repository access and the Issues permission.</p>}
    </form>
  );
}

export function SettingsSheet({ feeEur, defaultFeeEur, hidden, myPriceCount, onFee, onRestore, onClearPrices, token, onToken, onClose }: Props) {
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

      <TokenPanel token={token} onToken={onToken} />

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
