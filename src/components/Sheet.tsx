import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

interface Props {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
}

/** A bottom sheet for small forms (settings, add card). Closes on Esc, backdrop tap or "Done". */
export function Sheet({ title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      class="sheet"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div class="sheet-inner">
        <header class="sheet-bar">
          <h2>{title}</h2>
          <button type="button" class="pill-btn" onClick={onClose}>
            Done
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
