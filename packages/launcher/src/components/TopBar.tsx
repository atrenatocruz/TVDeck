import { useEffect, useState } from "preact/hooks";
import { greeting } from "../tileInfo.ts";
import { status } from "../store.ts";

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
  unauthorized: "Launcher not authorised",
} as const;

export function TopBar() {
  const now = useNow();
  const parts = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).formatToParts(now);
  const time = parts.filter((p) => p.type === "hour" || p.type === "literal" || p.type === "minute").map((p) => p.value).join("").trim();
  const period = parts.find((p) => p.type === "dayPeriod")?.value;
  const date = new Intl.DateTimeFormat([], { weekday: "long", day: "numeric", month: "long" }).format(now);
  const s = status.value;

  return (
    <header class="topbar">
      <div class="top-left">
        <div class="brand" aria-label="TVDeck">
          <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
            <rect x="2" y="9" width="28" height="19" rx="6" class="bm-back" />
            <rect x="2" y="4" width="28" height="19" rx="6" class="bm-front" />
            <circle cx="16" cy="13.5" r="3.4" class="bm-dot" />
          </svg>
          <span class="brand-name">TVDeck</span>
          <span class="link" data-status={s} role="status" aria-live="polite">
            <i class="link-dot" />
            {s !== "connected" ? <span class="link-text">{LINK_TEXT[s]}</span> : null}
          </span>
        </div>
        <h1 class="greeting">{greeting(now)}</h1>
      </div>
      <div class="top-right">
        <div class="clock">
          <span class="clock-time">{time}</span>
          {period ? <span class="clock-period">{period}</span> : null}
        </div>
        <div class="date">{date}</div>
      </div>
    </header>
  );
}
