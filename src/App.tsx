import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { DataFile } from '../shared/schema.ts';
import { analyze, BUCKETS, SORTS, sortRows, toggleBucket, visibleRows, type BucketId, type Row, type SortKey } from './lib/money.ts';
import { usePref, type PendingCard } from './lib/prefs.ts';
import { dayMonth, eurPlain } from './lib/format.ts';
import { CardGrid } from './components/CardGrid.tsx';
import { CardDetail } from './components/CardDetail.tsx';
import { SettingsSheet } from './components/SettingsSheet.tsx';
import { AddCardSheet } from './components/AddCardSheet.tsx';
import { Toast, type ToastMsg } from './components/Toast.tsx';

const DATA_URL = `${import.meta.env.BASE_URL}cards.json`;
const DATA_CACHE = 'slab-data';

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: DataFile };
type Overlay = { kind: 'card'; id: string } | { kind: 'settings' } | { kind: 'add' } | null;

/** Loads prices from the network, falling back to the last copy on this phone when offline. */
async function fetchData(): Promise<DataFile> {
  try {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status === 404 ? 'No price data has been published yet.' : `Couldn't load prices (HTTP ${res.status}).`);
    if ('caches' in window) caches.open(DATA_CACHE).then((c) => c.put(DATA_URL, res.clone())).catch(() => {});
    return (await res.json()) as DataFile;
  } catch (e) {
    const cached = 'caches' in window ? await caches.match(DATA_URL).catch(() => undefined) : undefined;
    if (cached) return (await cached.json()) as DataFile;
    throw e;
  }
}

export function App() {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [query, setQuery] = useState('');
  const [savedBuckets, setBucketList] = usePref<BucketId[]>('buckets', []);
  // Slots saved by an older version may no longer exist.
  const bucketList = useMemo(() => savedBuckets.filter((b) => BUCKETS.some((x) => x.id === b)), [savedBuckets]);
  const [sort, setSort] = usePref<SortKey>('sort', 'profit');
  const [feeEur, setFeeEur] = usePref<number | null>('feeEur', null);
  const [hidden, setHidden] = usePref<string[]>('hidden', []);
  const [myPrices, setMyPrices] = usePref<Record<string, number>>('myPrices', {});
  const [pending, setPending] = usePref<PendingCard[]>('pending', []);
  const [ghToken, setGhToken] = usePref<string | null>('ghToken', null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const toastTimer = useRef<number>();

  const showToast = useCallback((msg: ToastMsg) => {
    window.clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  }, []);

  const refresh = useCallback(() => {
    fetchData()
      .then((data) => setLoad({ status: 'ready', data }))
      .catch((e: unknown) => setLoad((prev) => (prev.status === 'ready' ? prev : { status: 'error', message: e instanceof Error ? e.message : String(e) })));
  }, []);
  useEffect(refresh, [refresh]);

  // While cards are waiting for prices, check for new data every minute.
  useEffect(() => {
    if (pending.length === 0) return;
    const t = window.setInterval(() => document.visibilityState === 'visible' && refresh(), 60_000);
    return () => window.clearInterval(t);
  }, [pending.length, refresh]);

  const data = load.status === 'ready' ? load.data : null;

  // Cards that arrived since they were added.
  useEffect(() => {
    if (!data || pending.length === 0) return;
    const ids = new Set(data.cards.map((c) => c.id));
    const arrived = pending.filter((p) => ids.has(p.id));
    if (arrived.length) {
      setPending(pending.filter((p) => !ids.has(p.id)));
      showToast({ text: `Added ${arrived.map((p) => p.name).join(', ')}` });
    }
  }, [data, pending, setPending, showToast]);

  // The phone's back gesture closes whatever is open.
  useEffect(() => {
    const onPop = () => setOverlay(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const open = (o: NonNullable<Overlay>) => {
    history.pushState({ overlay: o.kind }, '');
    setOverlay(o);
  };
  const close = () => {
    if (history.state?.overlay) history.back();
    else setOverlay(null);
  };

  const fee = feeEur ?? data?.defaults.gradingFeeEur ?? 25;
  const rate = data?.fx.usdToEur ?? 1;
  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);
  const knownIds = useMemo(() => new Set(data?.cards.map((c) => c.id) ?? []), [data]);
  const buckets = useMemo(() => new Set(bucketList), [bucketList]);

  const rows: Row[] = useMemo(
    () => (data ? data.cards.filter((c) => !hiddenSet.has(c.id)).map((card) => ({ card, a: analyze(card, rate, fee, myPrices[card.id]) })) : []),
    [data, rate, fee, myPrices, hiddenSet],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) if (r.a.bucket) c[r.a.bucket] = (c[r.a.bucket] ?? 0) + 1;
    return c;
  }, [rows]);
  const visible = useMemo(() => sortRows(visibleRows(rows, query, buckets), sort), [rows, query, buckets, sort]);
  const searching = query.trim().length > 0;

  // New results start at the top instead of leaving you halfway down a shorter list.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
  }, [query, bucketList, sort]);

  const selected = overlay?.kind === 'card' ? rows.find((r) => r.card.id === overlay.id) ?? null : null;

  const hideCard = (id: string) => {
    const card = data?.cards.find((c) => c.id === id);
    setHidden((h) => [...h.filter((x) => x !== id), id]);
    close();
    showToast({ text: `Removed ${card?.name ?? 'card'}`, action: { label: 'Undo', run: () => setHidden((h) => h.filter((x) => x !== id)) } });
  };

  return (
    <>
      <header class="top glass">
        <div class="top-inner">
          <div class="brand">
            <h1>Slab Scout</h1>
            {data && <span class="stamp">{dayMonth(data.generatedAt)}</span>}
            <div class="brand-actions">
              <button type="button" class="pill-btn" onClick={() => open({ kind: 'settings' })} aria-label={`Settings, grading fee ${eurPlain(fee)}`}>
                Fee {eurPlain(fee)}
              </button>
              <button type="button" class="round-btn" onClick={() => open({ kind: 'add' })} aria-label="Add a card">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
                </svg>
              </button>
            </div>
          </div>

          <div class="search">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2" />
              <path d="M16 16l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            <label for="q" class="sr-only">
              Search all cards
            </label>
            <input
              id="q"
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellcheck={false}
              placeholder="Search all cards"
              value={query}
              onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
            />
            {query && (
              <button type="button" class="clear" aria-label="Clear search" onClick={() => setQuery('')}>
                ×
              </button>
            )}
          </div>

          <nav class="chips" aria-label="Price range" data-muted={searching || undefined}>
            <button type="button" class="chip" aria-pressed={buckets.size === 0} onClick={() => setBucketList([])}>
              All
            </button>
            {BUCKETS.map((b) => (
              <button
                key={b.id}
                type="button"
                class="chip"
                aria-pressed={buckets.has(b.id)}
                data-empty={!counts[b.id] || undefined}
                onClick={() => setBucketList([...toggleBucket(buckets, b.id)])}
              >
                {b.label}
                <span class="chip-n">{counts[b.id] ?? 0}</span>
              </button>
            ))}
          </nav>

          <div class="toolbar">
            <span class="count">
              {searching ? `${visible.length} found in all cards` : `${visible.length} cards`}
            </span>
            <label class="sort">
              <span class="sr-only">Sort</span>
              <select id="sort" value={sort} onChange={(e) => setSort((e.currentTarget as HTMLSelectElement).value as SortKey)}>
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </header>

      <main class="page">
        {load.status === 'loading' && <p class="note">Loading prices…</p>}
        {load.status === 'error' && <p class="note">{load.message}</p>}
        {data && visible.length === 0 && (
          <p class="note">{searching ? `No card matches “${query}”. Add it with the + button.` : 'No cards in this price range.'}</p>
        )}
        {data && <CardGrid rows={visible} onOpen={(id) => open({ kind: 'card', id })} />}
        {data && (
          <footer class="foot">
            <p>
              {data.cards.length} cards from the PokeViews grading list{data.cards.some((c) => c.added) ? ' plus cards you added' : ''}. Raw price: average of
              the 10 cheapest Near Mint English copies on Cardmarket; “est.” is Cardmarket’s own estimate, “yours” is a price you entered. Graded prices:
              PriceCharting (US), in euros. Fee {eurPlain(fee)} per card. Prices from {data ? dayMonth(data.generatedAt) : ''}.
            </p>
            {hidden.length > 0 && (
              <button type="button" class="link" onClick={() => open({ kind: 'settings' })}>
                {hidden.length} removed · Manage
              </button>
            )}
          </footer>
        )}
      </main>

      {selected && data && (
        <CardDetail
          key={selected.card.id}
          row={selected}
          data={data}
          myPrice={myPrices[selected.card.id] ?? null}
          onSetMyPrice={(v) =>
            setMyPrices((p) => {
              const next = { ...p };
              if (v == null) delete next[selected.card.id];
              else next[selected.card.id] = v;
              return next;
            })
          }
          onHide={() => hideCard(selected.card.id)}
          onClose={close}
        />
      )}
      {overlay?.kind === 'settings' && data && (
        <SettingsSheet
          feeEur={fee}
          defaultFeeEur={data.defaults.gradingFeeEur}
          hidden={data.cards.filter((c) => hiddenSet.has(c.id))}
          myPriceCount={Object.keys(myPrices).length}
          onFee={(v) => setFeeEur(v === data.defaults.gradingFeeEur ? null : v)}
          onRestore={(id) => setHidden((h) => h.filter((x) => x !== id))}
          onClearPrices={() => setMyPrices({})}
          token={ghToken}
          onToken={setGhToken}
          onClose={close}
        />
      )}
      {overlay?.kind === 'add' && (
        <AddCardSheet
          token={ghToken}
          knownIds={knownIds}
          pending={pending}
          onRequested={(p) => {
            setPending((list) => [...list.filter((x) => x.id !== p.id), p]);
            showToast({ text: `Adding ${p.name}. Prices in about 5 minutes.` });
          }}
          onForget={(id) => setPending((list) => list.filter((x) => x.id !== id))}
          onOpenSettings={() => setOverlay({ kind: 'settings' })}
          onClose={close}
        />
      )}
      <Toast msg={toast} onDone={() => setToast(null)} />
    </>
  );
}
