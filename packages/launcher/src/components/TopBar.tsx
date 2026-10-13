import { useEffect, useState } from "preact/hooks";
import { devices, focusId, overlay, PHONES_ID, status } from "../store.ts";

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let t = 0;
    const tick = () => {
      setNow(new Date());
      // wake exactly on the next minute boundary
      t = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    t = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    return () => clearTimeout(t);
  }, []);
  return now;
}

const LINK_TEXT = {
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting",
  unauthorized: "Not authorised",
} as const;

/** Quiet corner chrome: a small mark on the left; connection, settings and the time on the right. */
export function TopBar() {
  const now = useNow();
  const time = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(now);
  const date = new Intl.DateTimeFormat([], { weekday: "long", day: "numeric", month: "long" }).format(now);
  const s = status.value;
  const focused = focusId.value === PHONES_ID;
  const count = devices.value?.length;

  return (
    <header class="topbar" data-awake={focused ? "" : undefined}>
      <svg class="brand-mark" viewBox="0 0 32 32" role="img" aria-label="TVDeck">
        <rect x="2" y="9" width="28" height="19" rx="6" class="bm-back" />
        <rect x="2" y="4" width="28" height="19" rx="6" class="bm-front" />
      </svg>
      <div class="corner">
        <span class="link" data-status={s} role="status" aria-live="polite">
          <i class="link-dot" />
          <span class="link-text">{LINK_TEXT[s]}</span>
        </span>
        <button
          class="gear"
          type="button"
          tabIndex={-1}
          aria-label="Phones"
          data-focused={focused ? "" : undefined}
          onPointerMove={(e) => (e.movementX || e.movementY) && focusId.value !== PHONES_ID && (focusId.value = PHONES_ID)}
          onClick={() => (overlay.value = { kind: "devices" })}
        >
          <span class="gear-label">Phones{count ? ` \u00b7 ${count}` : ""}</span>
          <span class="gear-disc">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" stroke-width="3.6" stroke-dasharray="2.6 2.6" />
              <circle cx="12" cy="12" r="6.6" fill="none" stroke="currentColor" stroke-width="2.2" />
              <circle cx="12" cy="12" r="2.4" fill="none" stroke="currentColor" stroke-width="2" />
            </svg>
          </span>
        </button>
        <div class="clock" title={date}>
          <span class="clock-time">{time}</span>
          <span class="clock-date">{date}</span>
        </div>
      </div>
    </header>
  );
}
