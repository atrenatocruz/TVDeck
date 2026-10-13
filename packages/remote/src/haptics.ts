/** Short tick on supported devices (Android). iOS Safari has no Vibration API; this is a no-op there. */
export function tick(ms = 8): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}
