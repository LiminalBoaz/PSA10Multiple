interface Props {
  value: string;
  onInput: (v: string) => void;
}

export function SearchBar({ value, onInput }: Props) {
  return (
    <div class="search">
      <label for="q" class="sr-only">Search cards</label>
      <input
        id="q"
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellcheck={false}
        placeholder="Search name, set or number"
        value={value}
        onInput={(e) => onInput((e.currentTarget as HTMLInputElement).value)}
      />
      {value && (
        <button type="button" class="clear" aria-label="Clear search" onClick={() => onInput('')}>
          ×
        </button>
      )}
    </div>
  );
}
