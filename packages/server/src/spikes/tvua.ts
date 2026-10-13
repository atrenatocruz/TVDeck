/**
 * Spike: does a "tv" web tile get YouTube's TV interface? Launches Edge exactly like a tile would, in a
 * throwaway profile, lets tvPage.ts apply the user agent and open youtube.com/tv, then checks over DevTools
 * that the page stayed on /tv and rendered the TV app. Closes that browser and deletes the profile.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildWebArgs, resolveUserAgent, webProfileDir } from "../apps/edge.ts";
import { prepareTvPage, readDevToolsPort } from "../apps/tvPage.ts";
import { findEdge } from "../paths.ts";
import { fail, pass, requireWindows, sleep } from "./common.ts";

requireWindows();

const url = "https://www.youtube.com/tv";
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tvdeck-tvua-"));
const ua = resolveUserAgent("tv")!;
const profile = webProfileDir(dataDir, ua);
fs.mkdirSync(profile, { recursive: true });

async function cdp(wsUrl: string, method: string, params: object = {}): Promise<any> {
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  const reply = await new Promise((r) => {
    ws.addEventListener("message", (m) => r(JSON.parse(String(m.data))));
    ws.send(JSON.stringify({ id: 1, method, params }));
  });
  ws.close();
  return reply;
}

let ok = false;
try {
  spawn(findEdge()!, buildWebArgs({ dataDir, url, userAgent: ua }), { detached: true, stdio: "ignore" }).unref();
  const t0 = Date.now();
  await prepareTvPage(profile, ua, url);
  pass("TV window prepared", `${Date.now() - t0} ms`);
  await sleep(12_000);
  const port = readDevToolsPort(profile)!;
  const pages = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
  const page = pages.find((p) => p.type === "page")!;
  const r = await cdp(page.webSocketDebuggerUrl, "Runtime.evaluate", {
    returnByValue: true,
    expression: "JSON.stringify({u:location.href, tv:document.querySelectorAll('[class*=ytlr],ytlr-app').length})",
  });
  const v = JSON.parse(r.result?.result?.value ?? "{}") as { u?: string; tv?: number };
  ok = !!v.u?.startsWith(url) && (v.tv ?? 0) > 0;
  (ok ? pass : fail)("YouTube TV interface loaded", `url=${v.u} tvElements=${v.tv}`);
  const ver = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()) as { webSocketDebuggerUrl: string };
  await cdp(ver.webSocketDebuggerUrl, "Browser.close").catch(() => {});
} catch (e) {
  fail("TV window", (e as Error).message);
}
await sleep(2000);
for (let i = 0; i < 10; i++) {
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
    break;
  } catch {
    await sleep(1000); // Edge is still releasing the profile
  }
}
console.log(ok ? "RESULT: ALL PASS" : "RESULT: FAILURES");
process.exit(ok ? 0 : 1);
