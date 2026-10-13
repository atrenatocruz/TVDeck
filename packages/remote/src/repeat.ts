export const REPEAT_DELAY_MS = 350;
export const REPEAT_INTERVAL_MS = 80;
/** Volume steps are coarser than cursor steps, so they repeat slower. */
export const VOLUME_REPEAT_INTERVAL_MS = 150;

export interface Repeater {
  start(): void;
  stop(): void;
}

const active = new Set<Repeater>();

/** Fire immediately, then after 350 ms repeat (default every 80 ms) until stopped. */
export function createRepeater(fire: () => void, intervalMs = REPEAT_INTERVAL_MS): Repeater {
  let delay: number | undefined;
  let interval: number | undefined;
  const r: Repeater = {
    start() {
      r.stop();
      active.add(r);
      fire();
      delay = window.setTimeout(() => {
        interval = window.setInterval(fire, intervalMs);
      }, REPEAT_DELAY_MS);
    },
    stop() {
      clearTimeout(delay);
      clearInterval(interval);
      delay = interval = undefined;
      active.delete(r);
    },
  };
  return r;
}

/** Safety net: never keep repeating while the page is hidden. */
export function stopAllRepeaters(): void {
  for (const r of [...active]) r.stop();
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") stopAllRepeaters();
});
window.addEventListener("blur", stopAllRepeaters);
