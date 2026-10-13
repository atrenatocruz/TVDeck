import { useEffect, useState } from "preact/hooks";
import { config, devices, focusId, overlay, PHONES_ID, status } from "../store.ts";
import { dayLabel, weather } from "../weather.ts";
import { WeatherIcon } from "./WeatherIcon.tsx";

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

/** Welcome line on the left; connection, settings, weather, day and time on the right. */
export function TopBar() {
  const now = useNow();
  const time = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(now);
  const date = new Intl.DateTimeFormat([], { weekday: "long", day: "numeric", month: "long" }).format(now);
  const s = status.value;
  const focused = focusId.value === PHONES_ID;
  const count = devices.value?.length;
  const welcome = config.value?.home?.welcome;
  const wx = weather.value;

  return (
    <header class="topbar" data-awake={focused ? "" : undefined}>
      {welcome ? <h1 class="welcome">{welcome}</h1> : <span />}
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
          <span class="gear-disc">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" stroke-width="3.6" stroke-dasharray="2.6 2.6" />
              <circle cx="12" cy="12" r="6.6" fill="none" stroke="currentColor" stroke-width="2.2" />
              <circle cx="12" cy="12" r="2.4" fill="none" stroke="currentColor" stroke-width="2" />
            </svg>
          </span>
          <span class="gear-label">Phones{count ? ` · ${count}` : ""}</span>
        </button>
        {wx ? (
          <span class="weather" aria-label={`${wx.temp} degrees`}>
            <WeatherIcon sky={wx.sky} />
            <span class="weather-temp">{wx.temp}°</span>
          </span>
        ) : null}
        <span class="day">{dayLabel(now)}</span>
        <div class="clock" title={date}>
          <span class="clock-time">{time}</span>
        </div>
      </div>
    </header>
  );
}
