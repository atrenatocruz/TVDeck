import { toasts } from "../store.ts";

export function Toasts() {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.value.map((t) => (
        <div class="toast" data-tone={t.tone} key={t.id}>
          <i class="toast-dot" />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
