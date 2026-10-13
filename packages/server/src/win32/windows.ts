import path from "node:path";
import { native } from "./user32.ts";

export interface WinInfo {
  hwnd: number;
  title: string;
  className: string;
  pid: number;
  tid: number;
  processName: string;
  visible: boolean;
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

export function listTopLevelWindows(): WinInfo[] {
  const handles: number[] = [];
  native.EnumWindows((h) => void handles.push(h));
  return handles.map(describeWindow);
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
