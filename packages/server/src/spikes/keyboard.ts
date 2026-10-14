/**
 * Spike: the on-screen keyboard end to end. Opens a throwaway Edge window with a text box, checks that
 * TVDeckKeyboard.exe reports the focused text field, shows the keyboard, drives it like the remote would
 * (nav/ok), types what it emits into the field with SendInput, and reads the field back from the title.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import { bringToFront } from "../win32/foreground.ts";
import { tapKey, typeText } from "../win32/input.ts";
import { native } from "../win32/user32.ts";
import { waitForWindow } from "../win32/windows.ts";
import { closeWindow, fail, launchEdgeApp, pass, requireWindows, sleep } from "./common.ts";

requireWindows();
const exe = path.resolve(import.meta.dirname, "..", "..", "..", "..", "app", "TVDeckKeyboard.exe");

const page = `<!doctype html><title>TVDeckKb|</title><body style="background:#111;color:#eee;font:24px sans-serif;padding:40px">
TVDeck keyboard spike - do not touch<br><br><input id="t" autofocus style="font-size:28px;width:70%">
<script>const t=document.getElementById('t');t.addEventListener('input',()=>document.title='TVDeckKb|'+t.value);addEventListener('load',()=>t.focus());</script>`;

const helper = spawn(exe, [], { stdio: ["pipe", "pipe", "inherit"] });
const events: { ev: string; edit?: boolean; text?: string; key?: string }[] = [];
readline.createInterface({ input: helper.stdout }).on("line", (l) => {
  try {
    const e = JSON.parse(l);
    events.push(e);
    if (e.ev === "text") typeText(e.text);
    if (e.ev === "key") tapKey(e.key);
  } catch {
    /* ignore */
  }
});
const cmd = (c: string) => helper.stdin.write(c + "\n");
let failures = 0;
const check = (ok: boolean, name: string, detail = "") => (ok ? pass(name, detail) : (failures++, fail(name, detail)));

launchEdgeApp("spike-kb", "data:text/html," + encodeURIComponent(page), ["--window-size=1100,500", "--force-renderer-accessibility"]);
const w = await waitForWindow((x) => x.title.startsWith("TVDeckKb") && x.processName.toLowerCase() === "msedge.exe", 20_000);
if (!w) {
  fail("test window appeared");
  helper.kill();
  process.exit(1);
}
await bringToFront(w.hwnd);
await sleep(2500);
check(events.some((e) => e.ev === "focus" && e.edit), "text field focus detected", JSON.stringify(events.filter((e) => e.ev === "focus").slice(-2)));

cmd("show");
await sleep(600);
// Keyboard opens on row 1 ("qwertyuiop"), col 0: q. Type "q", then right x2 -> "e", then down -> "d".
const steps = ["ok", "nav right", "nav right", "ok", "nav down", "ok"];
for (const s of steps) {
  if (native.GetForegroundWindow() !== w.hwnd) {
    check(false, "field kept focus while the keyboard is open", "focus moved; stopping");
    break;
  }
  cmd(s);
  await sleep(250);
}
await sleep(500);
const value = native.GetWindowText(w.hwnd).split("|")[1] ?? "";
check(value === "qed", "keyboard typed into the field", `value="${value}"`);
check(native.GetForegroundWindow() === w.hwnd, "Edge kept the focus (keyboard never activated)");

cmd("back");
await sleep(300);
check(events.some((e) => e.ev === "closed"), "Back closes the keyboard");
cmd("quit");
await closeWindow(w.hwnd);
helper.kill();
console.log(failures ? "RESULT: FAILURES" : "RESULT: ALL PASS");
process.exit(failures ? 1 : 0);
