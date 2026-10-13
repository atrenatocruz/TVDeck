/** "just now", "5 minutes ago", "3 hours ago", "yesterday", "4 days ago", else a date. */
export function relativeTime(then: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 90) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? "an hour ago" : `${h} hours ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  if (d < 14) return `${d} days ago`;
  return new Date(then).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

/** m:ss for a countdown in milliseconds. */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function pairedOn(t: number): string {
  return new Date(t).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}
