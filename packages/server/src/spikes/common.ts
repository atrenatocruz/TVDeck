import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { dataDir, findEdge } from "../paths.ts";
import { native, WM_CLOSE } from "../win32/user32.ts";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function requireWindows(): void {
  if (!native.available) {
    console.error("These spikes only run on Windows.");
    process.exit(2);
  }
}

export function launchEdgeApp(profileName: string, url: string, extra: string[] = []): void {
  const edge = findEdge();
  if (!edge) {
    console.error("Microsoft Edge not found.");
    process.exit(2);
  }
  const profile = path.join(dataDir(), profileName);
  fs.mkdirSync(profile, { recursive: true });
  const child = spawn(
    edge,
    [`--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-features=msEdgeSidebar", `--app=${url}`, ...extra],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
}

/** Politely closes a window the spike opened (never kills anything else). */
export async function closeWindow(hwnd: number): Promise<void> {
  if (!native.IsWindow(hwnd)) return;
  native.PostMessage(hwnd, WM_CLOSE, 0, 0);
  for (let i = 0; i < 30 && native.IsWindow(hwnd); i++) await sleep(100);
}

export const pass = (name: string, detail = "") => console.log(`  PASS  ${name}${detail ? "  " + detail : ""}`);
export const fail = (name: string, detail = "") => console.log(`  FAIL  ${name}${detail ? "  " + detail : ""}`);
export const skip = (name: string, detail = "") => console.log(`  SKIP  ${name}${detail ? "  " + detail : ""}`);
