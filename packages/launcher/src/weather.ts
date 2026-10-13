import { effect, signal } from "@preact/signals";
import type { HomeConfig } from "@tvdeck/protocol";
import { config } from "./store.ts";

export type Sky = "clear" | "night" | "partly" | "cloudy" | "fog" | "rain" | "snow" | "storm";

/** WMO weather code (as Open-Meteo reports it) to the icon we draw. */
export function skyOf(code: number, isDay: boolean): Sky {
  if (code === 0) return isDay ? "clear" : "night";
  if (code === 1 || code === 2) return isDay ? "partly" : "night";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  if (code >= 51 && code <= 82) return "rain";
  return "cloudy";
}

/** "Tuesday, 13th" */
export function dayLabel(d: Date): string {
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(d);
  const n = d.getDate();
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${weekday}, ${n}${suffix}`;
}

export interface Weather {
  sky: Sky;
  temp: number;
  unit: "C" | "F";
}

export const weather = signal<Weather | null>(null);

const REFRESH_MS = 15 * 60_000;
let timer: number | undefined;
let lastKey = "";

async function load(w: NonNullable<HomeConfig["weather"]>): Promise<void> {
  const unit = w.unit ?? "celsius";
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${w.latitude}&longitude=${w.longitude}` +
    `&current=temperature_2m,weather_code,is_day&temperature_unit=${unit}&timezone=auto`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const j = (await res.json()) as { current?: { temperature_2m: number; weather_code: number; is_day: number } };
    if (!j.current) return;
    weather.value = {
      sky: skyOf(j.current.weather_code, j.current.is_day === 1),
      temp: Math.round(j.current.temperature_2m),
      unit: unit === "celsius" ? "C" : "F",
    };
  } catch {
    // Offline or the service is down: keep the last reading; the next refresh tries again.
  }
}

/** Fetches the weather for the configured place now and every 15 minutes; follows config changes. */
effect(() => {
  const w = config.value?.home?.weather;
  const key = w ? `${w.latitude},${w.longitude},${w.unit ?? ""}` : "";
  if (key === lastKey) return;
  lastKey = key;
  clearInterval(timer);
  weather.value = null;
  if (!w) return;
  void load(w);
  timer = window.setInterval(() => void load(w), REFRESH_MS);
});
