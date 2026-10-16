import { useEffect, useRef, useState } from 'preact/hooks';
import { eur } from '../lib/format.ts';

interface Props {
  feeUsd: number;
  defaultFeeUsd: number;
  usdToEur: number;
  onSave: (feeUsd: number | null) => void;
  onClose: () => void;
}

export function Settings({ feeUsd, defaultFeeUsd, usdToEur, onSave, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(String(feeUsd));
  const n = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(n) && n >= 0 && n < 10000;

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      class="sheet settings"
      aria-labelledby="settings-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <form
        class="sheet-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onSave(n === defaultFeeUsd ? null : n);
          onClose();
        }}
      >
        <h2 id="settings-title">Grading cost per card</h2>
        <p class="hint">
          All-in cost to grade one card: PSA fee plus your share of shipping and insurance. Every profit and max-buy number
          uses it.
        </p>
        <label class="field" for="fee">
          <span>US dollars</span>
          <input
            id="fee"
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            value={value}
            onInput={(e) => setValue((e.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <p class="muted">{valid ? `≈ ${eur(n * usdToEur)}` : 'Enter an amount of 0 or more.'}</p>
        <div class="row">
          <button type="button" class="ghost" onClick={() => setValue(String(defaultFeeUsd))}>
            Reset to ${defaultFeeUsd}
          </button>
          <button type="submit" class="primary" disabled={!valid}>
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}
