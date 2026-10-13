import { unpairedReason } from "../ws.ts";

const COPY = {
  none: { title: "Not paired", body: "Open Phones on the TV and scan the QR code." },
  expired: { title: "Code expired", body: "This code expired — show a new one on the TV and scan it again." },
  removed: { title: "Not paired", body: "This phone was removed. Open Phones on the TV, choose Pair a new phone and scan the QR code." },
} as const;

/** Full-screen state shown whenever this phone has no valid credentials. */
export function Unpaired() {
  const { title, body } = COPY[unpairedReason.value];
  return (
    <main class="unpaired" role="alert">
      <div class="scan" aria-hidden="true">
        <svg viewBox="0 0 120 120">
          <g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 42V28a10 10 0 0 1 10-10h14M78 18h14a10 10 0 0 1 10 10v14M102 78v14a10 10 0 0 1-10 10H78M42 102H28a10 10 0 0 1-10-10V78" />
          </g>
          <g fill="currentColor">
            <rect x="40" y="40" width="16" height="16" rx="3" />
            <rect x="64" y="40" width="16" height="16" rx="3" />
            <rect x="40" y="64" width="16" height="16" rx="3" />
            <rect x="68" y="68" width="8" height="8" rx="2" />
          </g>
        </svg>
        <i class="scan-line" />
      </div>
      <h1 class="unpaired-title">{title}</h1>
      <p class="unpaired-body">{body}</p>
    </main>
  );
}
