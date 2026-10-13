import { pcName, retryNow } from "../ws.ts";

/** Covers the remote when the PC can't be reached for a few seconds. Reconnecting happens on its own. */
export function Offline() {
  const name = pcName.value;
  return (
    <div class="offline" role="alert" aria-live="polite">
      <main class="offline-card">
        <div class="tv" aria-hidden="true">
          <i class="tv-ring" />
          <svg viewBox="0 0 120 120">
            <g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="16" y="26" width="88" height="56" rx="10" />
              <path d="M44 98h32" />
              <path d="M60 82v16" />
            </g>
          </svg>
        </div>
        <h1 class="unpaired-title">TV is offline</h1>
        <p class="unpaired-body">{name ? `Can't reach ${name}.` : "Can't reach your PC."} Check that it's on and TVDeck is running. This screen reconnects by itself.</p>
        <div class="retrying">
          <i class="retry-dot" />
          <span>Trying again</span>
        </div>
        <button class="retry-btn" type="button" onClick={retryNow}>
          Try now
        </button>
      </main>
    </div>
  );
}
