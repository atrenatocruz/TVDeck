import { tapKey } from "./input.ts";
import { native, SW_MINIMIZE, SW_RESTORE } from "./user32.ts";

export type FocusStep = "already" | "alt+setForeground" | "attachThreadInput" | "minimizeForeground";
export interface FocusResult {
  ok: boolean;
  step: FocusStep | null;
}

const ASFW_ANY = -1;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isFront = (hwnd: number) => native.GetForegroundWindow() === hwnd;

function raise(hwnd: number): void {
  if (native.IsIconic(hwnd)) native.ShowWindow(hwnd, SW_RESTORE);
  native.SetForegroundWindow(hwnd);
  native.BringWindowToTop(hwnd);
}

/**
 * Escalation ladder for beating the Windows foreground lock. Checks
 * GetForegroundWindow() after each step and reports which one worked.
 */
export async function bringToFront(hwnd: number): Promise<FocusResult> {
  if (!native.IsWindow(hwnd)) return { ok: false, step: null };
  if (isFront(hwnd)) return { ok: true, step: "already" };

  // 1. A synthetic Alt tap makes us the source of the last input event.
  tapKey("alt");
  native.AllowSetForegroundWindow(ASFW_ANY);
  raise(hwnd);
  await sleep(80);
  if (isFront(hwnd)) return { ok: true, step: "alt+setForeground" };

  // 2. Attach to the current foreground window's input queue and retry.
  const fg = native.GetForegroundWindow();
  const fgThread = fg ? native.GetWindowThreadProcessId(fg).tid : 0;
  const me = native.GetCurrentThreadId();
  if (fgThread && fgThread !== me) {
    const attached = native.AttachThreadInput(me, fgThread, true);
    try {
      raise(hwnd);
      await sleep(80);
    } finally {
      if (attached) native.AttachThreadInput(me, fgThread, false);
    }
    if (isFront(hwnd)) return { ok: true, step: "attachThreadInput" };
  }

  // 3. Last resort: minimize whatever is in front, then retry.
  const cur = native.GetForegroundWindow();
  if (cur && cur !== hwnd) {
    native.ShowWindow(cur, SW_MINIMIZE);
    await sleep(100);
    raise(hwnd);
    await sleep(100);
    if (isFront(hwnd)) return { ok: true, step: "minimizeForeground" };
  }
  return { ok: false, step: null };
}

let launcherHwnd: number | null = null;
export const setLauncherWindow = (h: number | null): void => {
  launcherHwnd = h;
};

type Resolver = (step: (m: string) => void) => Promise<number | null>;
let resolver: Resolver | null = null;
/** Registered by apps/launcher.ts: re-finds the launcher window, or relaunches it. */
export const setLauncherResolver = (r: Resolver): void => {
  resolver = r;
};

/** "Home": raise the launcher, leave every app running. Re-finds or relaunches it when needed. */
export async function goHome(log: (m: string) => void = console.log): Promise<FocusResult | null> {
  if (launcherHwnd === null || !native.IsWindow(launcherHwnd)) {
    launcherHwnd = null;
    if (!resolver) {
      log("home: launcher not running (and no launcher configured)");
      return null;
    }
    launcherHwnd = await resolver((m) => log(`home: ${m}`));
    if (launcherHwnd === null) {
      log("home: launcher could not be found or started");
      return null;
    }
  } else {
    log("home: using remembered launcher window");
  }
  const r = await bringToFront(launcherHwnd);
  log(r.ok ? `home: launcher in front via ${r.step}` : "home: could not raise launcher");
  return r;
}
