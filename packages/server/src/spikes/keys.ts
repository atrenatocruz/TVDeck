/**
 * Spike: what does a remote (or any keyboard-like device) send? Opens a fullscreen Edge window that shows
 * every key event big enough to read from the couch, blocks the browser's default action for each one,
 * and prints the events here too (read back from the window title). Injects nothing. Runs for 3 minutes
 * or until the window is closed.
 */
import { native } from "../win32/user32.ts";
import { waitForWindow } from "../win32/windows.ts";
import { closeWindow, launchEdgeApp, requireWindows, sleep } from "./common.ts";

requireWindows();

const page = `<!doctype html><title>TVDeckKeys|</title>
<body style="margin:0;background:#101014;color:#eee;font:28px system-ui;padding:48px">
<h1 style="font-weight:600;margin:0 0 8px">Press each remote button, one at a time</h1>
<p style="color:#999;margin:0 0 32px">TVDeck key test. Nothing is sent to other apps. Close this window when done.</p>
<ol id="log" style="font:32px ui-monospace,monospace;line-height:1.6"></ol>
<script>
let n=0;const log=document.getElementById('log');const seen=[];
function show(kind,e){
  const s=kind+' key='+e.key+' code='+e.code+' keyCode='+e.keyCode;
  const li=document.createElement('li');li.textContent=s;log.prepend(li);
  seen.push((++n)+':'+kind+':'+e.key+':'+e.code+':'+e.keyCode);
  document.title='TVDeckKeys|'+seen.slice(-12).join(';');
}
addEventListener('keydown',e=>{e.preventDefault();show('down',e)},true);
addEventListener('keyup',e=>{e.preventDefault()},true);
addEventListener('popstate',()=>{history.pushState(null,'',location.href);show('popstate',{key:'(browser back)',code:'',keyCode:0})});
history.pushState(null,'',location.href);
</script>`;

launchEdgeApp("spike-keys", "data:text/html," + encodeURIComponent(page), ["--start-fullscreen"]);
const w = await waitForWindow((x) => x.title.startsWith("TVDeckKeys") && x.processName.toLowerCase() === "msedge.exe", 20_000);
if (!w) {
  console.log("key test window did not appear");
  process.exit(1);
}
console.log(`key test window open (hwnd=${w.hwnd}). Press the remote buttons now.`);

const printed = new Set<string>();
const end = Date.now() + 180_000;
while (Date.now() < end && native.IsWindow(w.hwnd)) {
  const entries = (native.GetWindowText(w.hwnd).split("|")[1] ?? "").split(";").filter(Boolean);
  for (const e of entries) {
    if (printed.has(e)) continue;
    printed.add(e);
    console.log(`  ${e}`);
  }
  await sleep(150);
}
await closeWindow(w.hwnd);
console.log("done");
process.exit(0);
