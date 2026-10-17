import { useEffect, useState } from 'preact/hooks';
import { pcSetName } from '../../shared/sets.ts';
import { slug } from '../../shared/slug.ts';
import { issueFormUrl, requestCard, type CardRequest } from '../lib/github.ts';
import type { PendingCard } from '../lib/prefs.ts';
import { searchCards, type FoundCard } from '../lib/tcgdex.ts';
import { Sheet } from './Sheet.tsx';

interface Props {
  token: string | null;
  knownIds: Set<string>;
  pending: PendingCard[];
  onRequested: (p: PendingCard) => void;
  onForget: (id: string) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

const requestId = (c: CardRequest) => slug(c.name, c.set, c.number.replace(/^#/, '') || null);

function ago(ms: number): string {
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? 'just now' : `${m} min ago`;
}

export function AddCardSheet({ token, knownIds, pending, onRequested, onForget, onOpenSettings, onClose }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<FoundCard[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [picked, setPicked] = useState<FoundCard | null>(null);
  const [manual, setManual] = useState(false);
  const [form, setForm] = useState({ name: '', set: '', number: '', pricecharting: '', cardmarket: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Search as you type (after a short pause), cancelling the previous request.
  useEffect(() => {
    setPicked(null);
    if (q.trim().length < 3) {
      setResults(null);
      return;
    }
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      setSearching(true);
      setSearchError('');
      searchCards(q, ctrl.signal)
        .then(setResults)
        .catch((e) => !ctrl.signal.aborted && setSearchError(e instanceof Error ? 'Search is unavailable right now. Enter the card yourself below.' : String(e)))
        .finally(() => !ctrl.signal.aborted && setSearching(false));
    }, 300);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [q]);

  const request: CardRequest | null = manual
    ? form.name.trim().length > 1 && form.set.trim().length > 1
      ? { name: form.name.trim(), set: form.set.trim(), number: form.number.trim(), pricecharting: form.pricecharting, cardmarket: form.cardmarket }
      : null
    : picked
      ? { name: picked.name, set: pcSetName(picked.setName), number: picked.number, tcgdex: picked.id }
      : null;
  const id = request ? requestId(request) : '';
  const already = Boolean(id && knownIds.has(id));
  const waiting = Boolean(id && pending.some((p) => p.id === id));

  const done = (r: CardRequest) => {
    onRequested({ id: requestId(r), name: r.name, set: r.set, number: r.number, at: Date.now() });
    setPicked(null);
    setQ('');
    setForm({ name: '', set: '', number: '', pricecharting: '', cardmarket: '' });
  };

  const add = async () => {
    if (!request || !token) return;
    setBusy(true);
    setError('');
    try {
      await requestCard(token, request);
      done(request);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const action = !request ? null : already ? (
    <p class="hint">Already on your list.</p>
  ) : waiting ? (
    <p class="hint">Already being added.</p>
  ) : token ? (
    <button type="button" class="pill-btn primary wide" disabled={busy} onClick={add}>
      {busy ? 'Adding…' : `Add ${request.name}`}
    </button>
  ) : (
    <a class="pill-btn primary wide" href={issueFormUrl(request)} target="_blank" rel="noopener noreferrer" onClick={() => done(request)}>
      Continue on GitHub
    </a>
  );

  const field = (key: keyof typeof form, label: string, placeholder: string, optional = false) => (
    <label class="field" for={`add-${key}`}>
      <span>
        {label}
        {optional && <small> optional</small>}
      </span>
      <input
        id={`add-${key}`}
        type={key === 'pricecharting' || key === 'cardmarket' ? 'url' : 'text'}
        autoComplete="off"
        placeholder={placeholder}
        value={form[key]}
        onInput={(e) => setForm({ ...form, [key]: (e.currentTarget as HTMLInputElement).value })}
      />
    </label>
  );

  return (
    <Sheet title="Add a card" onClose={onClose}>
      {!manual && (
        <div class="panel">
          <div class="search">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2" />
              <path d="M16 16l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            <label for="add-q" class="sr-only">
              Search any card
            </label>
            <input id="add-q" type="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" spellcheck={false} placeholder="Name and number, e.g. raichu 211" value={q} onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} />
          </div>
          {!results && !searching && <p class="hint">Type the card name, then its number or set to narrow it down.</p>}
          {searching && <p class="hint">Searching…</p>}
          {searchError && <p class="warn">{searchError}</p>}
          {results && !searching && results.length === 0 && <p class="hint">No cards found. Check the spelling or enter it yourself below.</p>}
          {results && results.length > 0 && (
            <ul class="results" aria-label="Search results">
              {results.map((r) => (
                <li key={r.id}>
                  <button type="button" class="result" aria-pressed={picked?.id === r.id} onClick={() => setPicked(picked?.id === r.id ? null : r)}>
                    <span class="result-art">{r.image ? <img src={r.image} alt="" width={64} height={89} loading="lazy" /> : null}</span>
                    <span class="result-text">
                      <strong>{r.name}</strong>
                      <small>
                        {r.setName} · {r.number}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {manual && (
        <div class="panel form">
          {field('name', 'Card name', 'e.g. Ditto (1st Edition)')}
          {field('set', 'Set', 'e.g. Fossil')}
          {field('number', 'Card number', 'e.g. 3')}
          {field('pricecharting', 'PriceCharting link', 'Paste a link', true)}
          {field('cardmarket', 'Cardmarket link', 'Paste a link', true)}
        </div>
      )}

      {(action || error) && (
        <div class="add-action">
          {action}
          {error && <p class="warn">{error}</p>}
          {request && !already && !waiting && (
            <p class="hint">
              {token
                ? 'Prices show up here in about 5 minutes.'
                : 'GitHub runs the price lookup for the app. This opens GitHub with the card filled in: log in if asked and tap Create. '}
              {!token && (
                <button type="button" class="link" onClick={onOpenSettings}>
                  Skip this step: set up one-tap adding (once)
                </button>
              )}
            </p>
          )}
        </div>
      )}

      <button type="button" class="link center" onClick={() => setManual(!manual)}>
        {manual ? 'Search for the card instead' : 'Not in the results? Enter it yourself'}
      </button>

      {pending.length > 0 && (
        <section class="panel">
          <h3 class="panel-title">Being added</h3>
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
