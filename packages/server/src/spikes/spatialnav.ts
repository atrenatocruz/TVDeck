/**
 * Spike: does Edge's --enable-spatial-navigation let arrow keys move focus between links on a page
 * that has no keyboard handling of its own? Opens a throwaway Edge app window with a grid of links,
 * verifies it is in the foreground before each key, and reads the focused link back from the title.
 */
import { bringToFront } from "../win32/foreground.ts";
import { tapKey } from "../win32/input.ts";
import type { KeyName } from "../win32/keymap.ts";
import { native } from "../win32/user32.ts";
import { waitForWindow } from "../win32/windows.ts";
import { closeWindow, fail, launchEdgeApp, pass, requireWindows, sleep } from "./common.ts";

requireWindows();

const cells = Array.from({ length: 6 }, (_, i) => `<a href="#" id="c${i}" style="display:inline-block;width:30%;margin:2%;padding:40px;background:#333;color:#eee">c${i}</a>`).join("");
const page = `<!doctype html><title>TVDeckSpatial|none</title><body style="background:#111;font:24px sans-serif">
TVDeck spatial navigation spike - do not touch<br>${cells}
<script>addEventListener('focusin',e=>{document.title='TVDeckSpatial|'+(e.target.id||e.target.tagName)})</script>`;

const sequence: KeyName[] = ["down", "right", "right", "down", "left"];
let failures = 0;

async function run(label: string, extra: string[]): Promise<string[]> {
  launchEdgeApp(`spike-spatial-${label}`, "data:text/html," + encodeURIComponent(page), ["--window-size=1000,600", ...extra]);
  const w = await waitForWindow((x) => x.title.startsWith("TVDeckSpatial") && x.processName.toLowerCase() === "msedge.exe", 25000);
  if (!w) {
    fail(`${label}: window appeared`);
    failures++;
    return [];
  }
  await sleep(800);
  const seen: string[] = [];
  for (const key of sequence) {
    await bringToFront(w.hwnd);
    await sleep(150);
    if (native.GetForegroundWindow() !== w.hwnd) {
      fail(`${label}: window lost focus, stopped before injecting`);
      failures++;
      break;
    }
    tapKey(key);
    await sleep(250);
    seen.push(native.GetWindowText(w.hwnd).split("|")[1] ?? "?");
  }
  await closeWindow(w.hwnd);
  console.log(`  ${label}: ${sequence.join(",")} -> ${seen.join(",")}`);
  return seen;
}

const off = await run("off", []);
const on = await run("on", ["--enable-spatial-navigation"]);
const moved = new Set(on.filter((s) => s.startsWith("c"))).size;
if (moved >= 3) pass("spatial navigation moves focus between links", `${moved} distinct links`);
else (failures++, fail("spatial navigation moves focus between links", `only ${moved}`));
if (!off.some((s) => s.startsWith("c"))) pass("without the flag, arrows do not move focus (baseline)");
console.log(failures ? "RESULT: FAILURES" : "RESULT: ALL PASS");
process.exit(failures ? 1 : 0);
