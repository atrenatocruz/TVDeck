/** Keeps the phone screen on while the remote is visible. Needs a secure context (https or localhost); silent elsewhere. */
type Sentinel = { released: boolean; release(): Promise<void>; addEventListener(t: "release", cb: () => void): void };
type WakeLockApi = { request(type: "screen"): Promise<Sentinel> };

let sentinel: Sentinel | null = null;
let wanted = false;

async function acquire(): Promise<void> {
  const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
  if (!api || !wanted || document.visibilityState !== "visible" || (sentinel && !sentinel.released)) return;
  try {
    const s = await api.request("screen");
    s.addEventListener("release", () => {
      if (sentinel === s) sentinel = null;
    });
    sentinel = s;
    if (!wanted) void s.release();
  } catch {
    /* denied (battery saver, insecure context): the screen just sleeps as usual */
  }
}

export function keepScreenOn(): void {
  if (wanted) return;
  wanted = true;
  void acquire();
  // the browser drops the lock when the page is hidden; take it again when it comes back
  document.addEventListener("visibilitychange", () => void acquire());
}
