/**
 * Spike: does SendInput reach a real window? Opens a throwaway Edge app window whose page records
 * keydown events into document.title, verifies it is in the foreground BEFORE injecting anything,
 * injects keys + unicode text, and reads the title back. Never types into any other app.
 */
import { bringToFront } from "../win32/foreground.ts";
import { mouseMoveRaw, tapKey, typeText } from "../win32/input.ts";
import type { KeyName } from "../win32/keymap.ts";
import { native } from "../win32/user32.ts";
import { waitForWindow } from "../win32/windows.ts";
import { closeWindow, fail, launchEdgeApp, pass, requireWindows, sleep } from "./common.ts";

requireWindows();

const page = `<!doctype html><title>TVDeckSpike||</title><body style="background:#111;color:#eee;font:24px sans-serif">
TVDeck input spike - do not touch<br><input id="t" autofocus style="font-size:24px;width:80%">
<script>
const keys=[];const t=document.getElementById('t');
function upd(){document.title='TVDeckSpike|'+keys.join(',')+'|'+t.value}
addEventListener('keydown',e=>{keys.push(e.key);upd()});
t.addEventListener('input',upd);
addEventListener('load',()=>t.focus());
</script>`;

const isSpike = (title: string) => title.startsWith("TVDeckSpike");
let failures = 0;
const check = (ok: boolean, name: string, detail = "") => {
  if (ok) pass(name, detail);
  else (failures++, fail(name, detail));
};

async function readTitle(hwnd: number, until: (t: string) => boolean): Promise<string> {
  let t = native.GetWindowText(hwnd);
  for (let i = 0; i < 20 && !until(t); i++) {
    await sleep(100);
    t = native.GetWindowText(hwnd);
  }
  return t;
}

console.log("== spike:input ==");
launchEdgeApp("spike-profile", "data:text/html," + encodeURIComponent(page), ["--window-size=900,400"]);
const win = await waitForWindow((w) => isSpike(w.title) && w.processName.toLowerCase() === "msedge.exe", 15_000);
if (!win) {
  fail("spike window appeared");
  process.exit(1);
}
pass("spike window appeared", `hwnd=${win.hwnd}`);

const front = await bringToFront(win.hwnd);
await sleep(400);
if (native.GetForegroundWindow() !== win.hwnd) {
  fail("spike window is foreground", `bringToFront step=${front.step}; ABORTING without injecting anything`);
  await closeWindow(win.hwnd);
  process.exit(1);
}
pass("spike window is foreground", `via ${front.step}`);

/** Re-checks (and if needed re-raises) the spike window before EVERY injection. */
async function ensureFront(): Promise<boolean> {
  if (native.GetForegroundWindow() === win!.hwnd) return true;
  await bringToFront(win!.hwnd);
  await sleep(150);
  return native.GetForegroundWindow() === win!.hwnd;
}

try {
  const seq: [KeyName, string][] = [
    ["up", "ArrowUp"], ["down", "ArrowDown"], ["left", "ArrowLeft"], ["right", "ArrowRight"],
    ["enter", "Enter"], ["esc", "Escape"], ["backspace", "Backspace"],
  ];
  for (const [key, expected] of seq) {
    if (!(await ensureFront())) {
      check(false, `key ${key}`, "window lost focus and could not be re-raised; skipped (nothing injected)");
      continue;
    }
    const before = native.GetWindowText(win.hwnd).split("|")[1]?.split(",").filter(Boolean).length ?? 0;
    const n = tapKey(key);
    const title = await readTitle(win.hwnd, (t) => (t.split("|")[1]?.split(",").filter(Boolean).length ?? 0) > before);
    const keys = title.split("|")[1]?.split(",").filter(Boolean) ?? [];
    const got = keys[keys.length - 1];
    check(n === 2 && got === expected, `key ${key}`, `SendInput=${n}/2, page saw ${got ?? "nothing"}`);
  }

  if (await ensureFront()) {
    const text = "héllo ✓";
    const n = typeText(text);
    const title = await readTitle(win.hwnd, (t) => t.endsWith(text));
    const got = title.split("|")[2] ?? "";
    check(got === text, `typeText "${text}"`, `SendInput=${n}/${text.length * 2}, page value="${got}"`);
  } else check(false, "typeText", "window lost focus, skipped");

  // Mouse: relative move +50,0 then back. Windows pointer ballistics may scale the delta.
  const a = native.GetCursorPos();
  mouseMoveRaw(50, 0);
  await sleep(80);
  const b = native.GetCursorPos();
  mouseMoveRaw(-(b.x - a.x), -(b.y - a.y));
  await sleep(80);
  const c = native.GetCursorPos();
  check(b.x > a.x, "mouse move +50,0", `cursor delta x=${b.x - a.x} y=${b.y - a.y} (ballistics may scale); restored=${c.x === a.x && c.y === a.y}`);
} finally {
  await closeWindow(win.hwnd);
  console.log("  (closed spike window)");
}

console.log(failures === 0 ? "RESULT: ALL PASS" : `RESULT: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
