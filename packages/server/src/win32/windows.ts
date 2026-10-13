import path from "node:path";
import { native, WS_EX_TOOLWINDOW } from "./user32.ts";

export interface WinInfo {
  hwnd: number;
  title: string;
  className: string;
  pid: number;
  tid: number;
  processName: string;
  visible: boolean;
  /** Present on windows from listTopLevelWindows(): zero-size, tool or cloaked windows set this to false. */
  real?: boolean;
}

const procCache = new Map<number, string>();
function processName(pid: number): string {
  const cached = procCache.get(pid);
  if (cached !== undefined) return cached;
  const p = native.ProcessImagePath(pid);
  const name = p ? path.basename(p) : "";
  if (name) procCache.set(pid, name);
  return name;
}

export function describeWindow(hwnd: number): WinInfo {
  const { pid, tid } = native.GetWindowThreadProcessId(hwnd);
  return {
    hwnd,
    title: native.GetWindowText(hwnd),
    className: native.GetClassName(hwnd),
    pid,
    tid,
    processName: processName(pid),
    visible: native.IsWindowVisible(hwnd),
  };
}

/** Visible, non-cloaked, non-tool window with a real size: something a user would call "a window". */
export function isRealWindow(hwnd: number): boolean {
  if (!native.IsWindowVisible(hwnd)) return false;
  if (native.GetExStyle(hwnd) & WS_EX_TOOLWINDOW) return false;
  const root = native.GetRootOwner(hwnd);
  if (root && root !== hwnd) return false; // owned popups/dialogs belong to their owner's window
  const { w, h } = native.GetWindowSize(hwnd);
  if (w < 80 || h < 60) return false;
  return !native.IsCloaked(hwnd);
}

export function listTopLevelWindows(): WinInfo[] {
  const handles: number[] = [];
  native.EnumWindows((h) => void handles.push(h));
  return handles.map((h) => {
    const w = describeWindow(h);
    w.real = w.visible && isRealWindow(h);
    return w;
  });
}

export function findWindow(pred: (w: WinInfo) => boolean): WinInfo | undefined {
  return listTopLevelWindows().find(pred);
}

export async function waitForWindow(
  pred: (w: WinInfo) => boolean,
  timeoutMs: number,
  pollMs = 150,
): Promise<WinInfo | undefined> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const w = findWindow(pred);
    if (w) return w;
    if (Date.now() >= end) return undefined;
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
