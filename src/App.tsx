import { useEffect, useMemo, useState } from 'preact/hooks';
import type { DataFile } from '../shared/schema.ts';
import { analyze, BUCKETS, matchesQuery, sortRows, type BucketId, type Row, type SortKey } from './lib/money.ts';
import { load, save } from './lib/store.ts';
import { shortDate } from './lib/format.ts';
import { SearchBar } from './components/SearchBar.tsx';
import { PriceChips, type ChipId } from './components/PriceChips.tsx';
import { CardGrid } from './components/CardGrid.tsx';
import { CardSheet } from './components/CardSheet.tsx';
import { Settings } from './components/Settings.tsx';

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: DataFile };

export function App() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState<ChipId>(() => load<ChipId>('chip', 'all'));
  const [sort, setSort] = useState<SortKey>(() => load<SortKey>('sort', 'profit'));
  const [feeUsd, setFeeUsd] = useState<number | null>(() => load<number | null>('feeUsd', null));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}cards.json`, { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'No price data has been published yet.' : `Couldn't load prices (HTTP ${r.status}).`);
        return r.json() as Promise<DataFile>;
      })
      .then((data) => setState({ status: 'ready', data }))
      .catch((e: unknown) => setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }));
  }, []);

  useEffect(() => save('chip', chip), [chip]);
  useEffect(() => save('sort', sort), [sort]);

  // Close the card sheet with the phone's back gesture.
  useEffect(() => {
    const onPop = () => setSelectedId(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const data = state.status === 'ready' ? state.data : null;
  const fee = feeUsd ?? data?.defaults.gradingFeeUsd ?? 25;
  const rate = data?.fx.usdToEur ?? 1;

  const rows: Row[] = useMemo(
    () => (data ? data.cards.map((card) => ({ card, a: analyze(card, rate, fee) })) : []),
    [data, rate, fee],
  );
  const searched = useMemo(() => rows.filter((r) => matchesQuery(r.card, query)), [rows, query]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(BUCKETS.map((b) => [b.id, 0])) as Record<BucketId, number>;
    for (const r of searched) if (r.a.bucket) c[r.a.bucket] += 1;
    return { ...c, all: searched.length };
  }, [searched]);
  const visible = useMemo(
    () => sortRows(chip === 'all' ? searched : searched.filter((r) => r.a.bucket === chip), sort),
    [searched, chip, sort],
  );
  const selected = rows.find((r) => r.card.id === selectedId) ?? null;

  const openCard = (id: string) => {
    history.pushState({ sheet: id }, '');
    setSelectedId(id);
  };
  const closeCard = () => {
    if (history.state?.sheet) history.back();
    else setSelectedId(null);
  };

  return (
    <>
      <header class="top">
        <div class="top-inner">
          <div class="brand">
            <h1>Slab Scout</h1>
            {data && <span class="stamp">Prices {shortDate(data.generatedAt)}</span>}
            <button type="button" class="fee-btn" onClick={() => setSettingsOpen(true)}>
              Fee ${fee}
            </button>
          </div>
          <SearchBar value={query} onInput={setQuery} />
          <PriceChips value={chip} counts={counts} onSelect={setChip} />
          <div class="toolbar">
            <span class="count">{visible.length} {visible.length === 1 ? 'card' : 'cards'}</span>
            <label class="sort">
              <span class="sr-only">Sort by</span>
              <select id="sort" value={sort} onChange={(e) => setSort((e.currentTarget as HTMLSelectElement).value as SortKey)}>
                <option value="profit">PSA 10 profit</option>
                <option value="multiplier">Multiplier</option>
                <option value="cheapest">Cheapest</option>
              </select>
            </label>
          </div>
        </div>
      </header>

      <main class="page">
        {state.status === 'loading' && <p class="note">Loading prices…</p>}
        {state.status === 'error' && (
          <div class="note">
            <p><strong>{state.message}</strong></p>
            <p>Run <code>npm run data</code> to pull fresh prices, then redeploy.</p>
          </div>
        )}
        {data && visible.length === 0 && (
          <p class="note">No cards match{query ? ` “${query}”` : ''} in this price range.</p>
        )}
        {data && <CardGrid rows={visible} onOpen={openCard} />}
        {data && (
          <p class="foot">
            {data.cards.length} cards from the PokeViews grading list. Raw = average of the 10 cheapest Near Mint English
            listings on Cardmarket; cards marked “trend” use Cardmarket’s trend price until listings are fetched. Graded
            prices are PriceCharting US sales, converted at $1 = €{data.fx.usdToEur.toFixed(3)} ({data.fx.date}). Grading
            fee ${fee}.
          </p>
        )}
      </main>

      {selected && data && <CardSheet row={selected} data={data} feeUsd={fee} onClose={closeCard} />}
      {settingsOpen && (
        <Settings
          feeUsd={fee}
          usdToEur={rate}
          defaultFeeUsd={data?.defaults.gradingFeeUsd ?? 25}
          onSave={(v) => {
            setFeeUsd(v);
            save('feeUsd', v);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </>
  );
}
