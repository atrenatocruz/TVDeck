/**
 * Spike M4: real injection of mouse, wheel, text, volume and media keys, self-verifying.
 *
 * Opens a throwaway Edge app window whose page records mouse moves, clicks, double clicks, right clicks,
 * wheel deltas and keys into document.title. Before EVERY injection the window must be the foreground
 * window (re-raised if needed, otherwise that step is skipped and nothing is injected). Mouse steps also
 * require that our window is the one under the pointer. The cursor is parked in the window and restored
 * afterwards. Volume goes up then down and mute toggles twice (net zero); play/pause is sent twice.
 */
import { bringToFront } from "../win32/foreground.ts";
import { mouseClick, mouseMove, mouseScroll, tapKey, typeText } from "../win32/input.ts";
import { native } from "../win32/user32.ts";
import { waitForWindow } from "../win32/windows.ts";
import { closeWindow, fail, launchEdgeApp, pass, requireWindows, sleep } from "./common.ts";

requireWindows();

const page = `<!doctype html><title>TVDeckM4|</title>
<body style="margin:0;background:#111;color:#eee;font:20px sans-serif;height:100vh;display:grid;grid-template-rows:auto 1fr">
<textarea id="t" autofocus style="font-size:22px;height:90px;margin:12px"></textarea>
<div style="padding:12px">TVDeck M4 input spike - do not touch</div>
<script>
const s={mv:0,cl:0,dbl:0,rc:0,wy:0,wx:0,keys:[]};const t=document.getElementById('t');
function upd(){document.title='TVDeckM4|'+JSON.stringify(s)+'|'+JSON.stringify(t.value)}
addEventListener('mousemove',()=>{s.mv++;upd()});
addEventListener('click',()=>{s.cl++;t.focus();upd()});
addEventListener('dblclick',()=>{s.dbl++;upd()});
addEventListener('contextmenu',e=>{e.preventDefault();s.rc++;upd()});
addEventListener('wheel',e=>{s.wy+=e.deltaY;s.wx+=e.deltaX;upd()},{passive:true});
addEventListener('keydown',e=>{s.keys.push(e.key);if(e.key==='Tab')e.preventDefault();upd()});
t.addEventListener('input',upd);
addEventListener('load',()=>{t.focus();upd()});
</script>`;

interface State {
  mv: number;
  cl: number;
  dbl: number;
  rc: number;
  wy: number;
  wx: number;
  keys: string[];
}
let failures = 0;
const check = (ok: boolean, name: string, detail = "") => {
  if (ok) pass(name, detail);
  else (failures++, fail(name, detail));
};

function read(hwnd: number): { s: State; value: string } {
  const [, json, value] = native.GetWindowText(hwnd).split("|");
  try {
    return { s: JSON.parse(json ?? "{}") as State, value: value ? (JSON.parse(value) as string) : "" };
  } catch {
    return { s: { mv: 0, cl: 0, dbl: 0, rc: 0, wy: 0, wx: 0, keys: [] }, value: "" };
  }
}
async function settle(hwnd: number, until: (r: ReturnType<typeof read>) => boolean, ms = 2000) {
  let r = read(hwnd);
  for (let t = 0; t < ms && !until(r); t += 50) {
    await sleep(50);
    r = read(hwnd);
  }
  return r;
}

console.log("== spike:m4 ==");
launchEdgeApp("spike-profile", "data:text/html," + encodeURIComponent(page), ["--window-size=900,500"]);
const win = await waitForWindow((w) => w.title.startsWith("TVDeckM4") && w.processName.toLowerCase() === "msedge.exe", 15_000);
if (!win) {
  fail("test window appeared");
  process.exit(1);
}
const hwnd = win.hwnd;
pass("test window appeared", `hwnd=${hwnd}`);

const cursor0 = native.GetCursorPos();
let skipped = 0;

/** Re-raises our window and confirms it is foreground. Nothing is injected if this returns false. */
async function ensureFront(): Promise<boolean> {
  if (native.GetForegroundWindow() === hwnd) return true;
  await bringToFront(hwnd);
  await sleep(200);
  return native.GetForegroundWindow() === hwnd;
}
/** Foreground AND our window is what is under the pointer. */
async function ensureFrontUnderPointer(): Promise<boolean> {
  if (!(await ensureFront())) return false;
  const r = native.GetWindowRect(hwnd);
  const cx = Math.round((r.left + r.right) / 2);
  const cy = Math.round(r.top + (r.bottom - r.top) * 0.7);
  const p = native.GetCursorPos();
  const inside = p.x > r.left + 20 && p.x < r.right - 20 && p.y > r.top + 150 && p.y < r.bottom - 20;
  if (!inside) native.SetCursorPos(cx, cy);
  await sleep(100);
  return native.RootWindowFromPoint(native.GetCursorPos().x, native.GetCursorPos().y) === hwnd;
}
const guarded = async (name: string, needPointer: boolean, fn: () => Promise<void>) => {
  const ok = needPointer ? await ensureFrontUnderPointer() : await ensureFront();
  if (!ok) {
    skipped++;
    failures++;
    fail(name, "test window not foreground/under pointer; skipped, nothing injected");
    return;
  }
  await fn();
};

try {
  const front = await bringToFront(hwnd);
  await sleep(500);
  if (native.GetForegroundWindow() !== hwnd) {
    fail("test window is foreground", `step=${front.step}; ABORTING without injecting anything`);
    process.exit(1);
  }
  pass("test window is foreground", `via ${front.step}`);

  // ---- mouse move ----
  await guarded("mouseMove", true, async () => {
    const a = native.GetCursorPos();
    const before = read(hwnd).s.mv;
    for (let i = 0; i < 6; i++) {
      mouseMove(10, 0);
      await sleep(16);
    }
    const r = await settle(hwnd, (x) => x.s.mv > before);
    const b = native.GetCursorPos();
    check(r.s.mv > before && b.x > a.x, "mouseMove (6 x 10px, accelerated)", `page mousemoves=${r.s.mv - before}, cursor dx=${b.x - a.x} dy=${b.y - a.y}`);
    native.SetCursorPos(a.x, a.y);
  });

  // ---- clicks ----
  await guarded("left click", true, async () => {
    const n = mouseClick("left");
    const r = await settle(hwnd, (x) => x.s.cl >= 1);
    check(n === 2 && r.s.cl === 1, "mouseClick left", `SendInput=${n}/2, page clicks=${r.s.cl}`);
  });
  await sleep(700); // outside the OS double-click window
  await guarded("double click", true, async () => {
    const before = read(hwnd).s;
    const n = mouseClick("left", true);
    const r = await settle(hwnd, (x) => x.s.dbl > before.dbl);
    check(n === 4 && r.s.dbl === before.dbl + 1 && r.s.cl === before.cl + 2, "mouseClick left double:true", `SendInput=${n}/4, dblclick=${r.s.dbl}, clicks=${r.s.cl}`);
  });
  await sleep(700);
  await guarded("two quick taps", true, async () => {
    const before = read(hwnd).s;
    mouseClick("left");
    await sleep(80);
    mouseClick("left");
    const r = await settle(hwnd, (x) => x.s.dbl > before.dbl);
    check(r.s.dbl === before.dbl + 1, "two separate left clicks 80ms apart make a double-click", `dblclick=${r.s.dbl - before.dbl}`);
  });
  await sleep(700);
  await guarded("right click", true, async () => {
    const n = mouseClick("right");
    const r = await settle(hwnd, (x) => x.s.rc >= 1);
    check(n === 2 && r.s.rc === 1, "mouseClick right (contextmenu)", `SendInput=${n}/2, contextmenu events=${r.s.rc}`);
  });

  // ---- scroll ----
  await guarded("scroll", true, async () => {
    const before = read(hwnd).s;
    mouseScroll(0, 120); // 3 notches down
    const r = await settle(hwnd, (x) => x.s.wy > before.wy);
    check(r.s.wy - before.wy > 0, "mouseScroll dy=+120 scrolls down", `page deltaY=${r.s.wy - before.wy}`);
    const b2 = read(hwnd).s;
    mouseScroll(80, 0); // 2 notches right
    const r2 = await settle(hwnd, (x) => x.s.wx !== b2.wx);
    check(r2.s.wx - b2.wx > 0, "mouseScroll dx=+80 scrolls right", `page deltaX=${r2.s.wx - b2.wx}`);
  });

  // ---- text and keys ----
  await guarded("typeText", false, async () => {
    mouseClick("left"); // click refocuses the textarea in the test page
    await sleep(150);
    const text = "héllo ✓ \u{1F600}";
    const n = typeText(text);
    const r = await settle(hwnd, (x) => x.value === text);
    check(r.value === text, `typeText with accent, symbol and emoji`, `SendInput=${n}/${text.length * 2}, page value=${JSON.stringify(r.value)}`);
  });
  await guarded("backspace", false, async () => {
    tapKey("backspace"); // removes the whole emoji (one grapheme)
    const r = await settle(hwnd, (x) => x.value === "héllo ✓ ");
    check(r.value === "héllo ✓ ", "textKey backspace removes the emoji", `page value=${JSON.stringify(r.value)}`);
  });
  await guarded("enter + space + tab", false, async () => {
    tapKey("enter");
    tapKey("space");
    tapKey("tab");
    const r = await settle(hwnd, (x) => x.s.keys.includes("Tab") && x.value.endsWith("\n "));
    check(r.value.endsWith("\n "), "textKey enter and space", `page value=${JSON.stringify(r.value)}`);
    check(r.s.keys.includes("Tab"), "textKey tab", `keys seen: ${r.s.keys.slice(-4).join(",")}`);
  });

  // ---- volume (net zero) ----
  await guarded("volume", false, async () => {
    const up = tapKey("volumeUp");
    await sleep(250);
    const down = tapKey("volumeDown");
    await sleep(250);
    check(up === 2 && down === 2, "volume up then down (net zero)", `SendInput up=${up}/2 down=${down}/2`);
    const m1 = tapKey("mute");
    await sleep(350);
    const m2 = tapKey("mute");
    await sleep(250);
    check(m1 === 2 && m2 === 2, "mute then unmute (net zero)", `SendInput mute=${m1}/2 unmute=${m2}/2`);
  });

  // ---- media (page foreground; toggled twice) ----
  await guarded("media", false, async () => {
    const a = tapKey("playPause");
    await sleep(400);
    const b = tapKey("playPause");
    await sleep(300);
    check(a === 2 && b === 2, "media playPause x2 (net zero)", `SendInput=${a}/2,${b}/2`);
  });
} finally {
  native.SetCursorPos(cursor0.x, cursor0.y);
  const c = native.GetCursorPos();
  console.log(`  cursor restored: ${c.x === cursor0.x && c.y === cursor0.y} (${c.x},${c.y})`);
  await closeWindow(hwnd);
  console.log("  (closed test window)");
}

console.log(failures === 0 ? "RESULT: ALL PASS" : `RESULT: ${failures} FAILED${skipped ? ` (${skipped} skipped for focus)` : ""}`);
process.exit(failures === 0 ? 0 : 1);
