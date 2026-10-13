/**
 * Spike: can "Home" win the foreground back from other apps? Opens a stand-in "TVDeck" launcher
 * window, then for each scenario window (Notepad, a fullscreen Edge app, Steam Big Picture if
 * installed) puts that window in front and runs bringToFront(launcher), printing which rung of
 * the escalation ladder worked. Only windows this script opened are closed. Nothing is typed.
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import { bringToFront } from "../win32/foreground.ts";
import { native } from "../win32/user32.ts";
import { listTopLevelWindows, waitForWindow, type WinInfo } from "../win32/windows.ts";
import { closeWindow, fail, launchEdgeApp, pass, requireWindows, skip, sleep } from "./common.ts";

requireWindows();

const html = (title: string, body: string) =>
  "data:text/html," + encodeURIComponent(`<!doctype html><title>${title}</title><body style="background:#0b0d12;color:#eee;font:32px sans-serif;display:grid;place-items:center;height:100vh">${body}`);

let failures = 0;

async function runScenario(name: string, launcher: WinInfo, target: WinInfo): Promise<void> {
  // Make sure the scenario window is what is in front first.
  await bringToFront(target.hwnd);
  await sleep(500);
  const fg = native.GetForegroundWindow();
  if (fg !== target.hwnd) {
    skip(name, `could not put the scenario window in front first (foreground is hwnd ${fg}), result would be meaningless`);
    return;
  }
  const r = await bringToFront(launcher.hwnd);
  await sleep(200);
  const ok = r.ok && native.GetForegroundWindow() === launcher.hwnd;
  if (ok) pass(name, `launcher raised via step: ${r.step}`);
  else (failures++, fail(name, "launcher could not be raised (all ladder steps failed)"));
}

function steamInstalled(): boolean {
  try {
    const out = execFileSync("reg", ["query", "HKCU\\Software\\Valve\\Steam", "/v", "SteamExe"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const m = /SteamExe\s+REG_SZ\s+(.+)/.exec(out);
    return !!m && fs.existsSync(m[1]!.trim());
  } catch {
    return fs.existsSync("C:\\Program Files (x86)\\Steam\\steam.exe");
  }
}

console.log("== spike:home ==");
launchEdgeApp("spike-launcher", html("TVDeck", "TVDeck launcher stand-in"), ["--window-size=800,500"]);
const launcher = await waitForWindow((w) => w.title === "TVDeck" && w.processName.toLowerCase() === "msedge.exe", 15_000);
if (!launcher) {
  fail("launcher stand-in window appeared");
  process.exit(1);
}
pass("launcher stand-in window appeared", `hwnd=${launcher.hwnd}`);

const opened: number[] = [launcher.hwnd];
try {
  // (a) Notepad (packaged app: the spawned PID is useless, so find by process name + new hwnd)
  {
    const before = new Set(listTopLevelWindows().map((w) => w.hwnd));
    spawn("notepad.exe", [], { detached: true, stdio: "ignore" }).unref();
    const np = await waitForWindow((w) => !before.has(w.hwnd) && w.processName.toLowerCase() === "notepad.exe" && w.visible && w.title !== "", 10_000);
    if (!np) (failures++, fail("notepad", "Notepad window not found"));
    else {
      opened.push(np.hwnd);
      await runScenario("notepad", launcher, np);
    }
  }

  // (b) fullscreen Edge app window with a different profile
  {
    launchEdgeApp("spike-app", html("TVDeckSpikeApp", "fullscreen app stand-in"), ["--start-fullscreen"]);
    const app = await waitForWindow((w) => w.title === "TVDeckSpikeApp" && w.processName.toLowerCase() === "msedge.exe", 15_000);
    if (!app) (failures++, fail("edge-fullscreen", "window not found"));
    else {
      opened.push(app.hwnd);
      await sleep(800); // let fullscreen settle
      await runScenario("edge-fullscreen", launcher, app);
    }
  }

  // (c) Steam Big Picture, only if installed. Steam is left running.
  if (!steamInstalled()) skip("steam-bigpicture", "Steam is not installed");
  else {
    const before = new Set(listTopLevelWindows().map((w) => w.hwnd));
    spawn("cmd.exe", ["/c", "start", "", "steam://open/bigpicture"], { detached: true, stdio: "ignore" }).unref();
    const st = await waitForWindow(
      (w) => !before.has(w.hwnd) && w.visible && /^steam/i.test(w.processName) && /big picture|^steam$/i.test(w.title),
      20_000,
    );
    if (!st) skip("steam-bigpicture", "Big Picture window did not appear within 20 s");
    else await runScenario("steam-bigpicture", launcher, st);
  }
} finally {
  for (const h of opened.reverse()) await closeWindow(h);
  console.log("  (closed the windows this spike opened; Steam, if used, was left running)");
}

console.log(failures === 0 ? "RESULT: no failures" : `RESULT: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
