export interface ToastMsg {
  text: string;
  action?: { label: string; run: () => void };
}

export function Toast({ msg, onDone }: { msg: ToastMsg | null; onDone: () => void }) {
  if (!msg) return null;
  return (
    <div class="toast glass" role="status">
      <span>{msg.text}</span>
      {msg.action && (
        <button
          type="button"
          onClick={() => {
            msg.action!.run();
            onDone();
          }}
        >
          {msg.action.label}
        </button>
      )}
    </div>
  );
}
