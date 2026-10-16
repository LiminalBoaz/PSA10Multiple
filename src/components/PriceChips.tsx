import { BUCKETS, type BucketId } from '../lib/money.ts';

export type ChipId = 'all' | BucketId;

interface Props {
  value: ChipId;
  counts: Record<ChipId, number>;
  onSelect: (id: ChipId) => void;
}

const CHIPS: { id: ChipId; label: string }[] = [{ id: 'all', label: 'All' }, ...BUCKETS.map((b) => ({ id: b.id as ChipId, label: b.label }))];

export function PriceChips({ value, counts, onSelect }: Props) {
  return (
    <nav class="chips" aria-label="Price range (Cardmarket raw)">
      {CHIPS.map((c) => (
        <button
          key={c.id}
          type="button"
          class="chip"
          aria-pressed={value === c.id}
          data-empty={counts[c.id] === 0 || undefined}
          onClick={() => onSelect(c.id)}
        >
          {c.label}
          <span class="chip-n">{counts[c.id]}</span>
        </button>
      ))}
    </nav>
  );
}
