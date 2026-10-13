/**
 * TV interfaces for web tiles with a `userAgent`.
 *
 * Edge's --user-agent flag changes navigator.userAgent but still reports Edge through client hints
 * (navigator.userAgentData, Sec-CH-UA), and youtube.com/tv checks those and redirects to the desktop site.
 * Overriding the user agent through the DevTools protocol (Emulation.setUserAgentOverride without metadata)
 * drops the client hints too, and the TV interface loads. So these tiles start Edge on a placeholder page with a
 * DevTools port (random, loopback-only, written to <profile>\DevToolsActivePort), and we apply the override
 * and then navigate. The session stays open: the override lasts as long as it does.
 */
import fs from "node:fs";
import path from "node:path";
import { WebSocket } from "ws";
import { log } from "../log.ts";
import { TV_PLACEHOLDER } from "./edge.ts";

interface PageTarget {
  id: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

/** DevTools may report the data: URL percent-encoded. */
const isPlaceholder = (url: string) => {
  try {
    return decodeURI(url) === TV_PLACEHOLDER || url === TV_PLACEHOLDER;
  } catch {
    return url === TV_PLACEHOLDER;
  }
};

/** Live sessions by target id, kept open so the override stays applied. */
const sessions = new Map<string, WebSocket>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Port from the DevToolsActivePort file Edge writes into the profile folder, or null. */
export function readDevToolsPort(profileDir: string): number | null {
  try {
    const first = fs.readFileSync(path.join(profileDir, "DevToolsActivePort"), "utf8").split(/\r?\n/)[0] ?? "";
    const port = Number(first.trim());
    return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
  } catch {
    return null;
  }
}

async function listPages(port: number): Promise<PageTarget[]> {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500) });
  const all = (await res.json()) as PageTarget[];
  return all.filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
}

function attach(target: PageTarget): Promise<(method: string, params?: object) => Promise<void>> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(target.webSocketDebuggerUrl!, { perMessageDeflate: false });
    let id = 0;
    const pending = new Map<number, () => void>();
    ws.on("message", (raw) => {
      const msg = JSON.parse(String(raw)) as { id?: number };
      if (msg.id === undefined) return;
      pending.get(msg.id)?.();
      pending.delete(msg.id);
    });
    ws.once("open", () => {
      sessions.set(target.id, ws);
      resolve(
        (method, params = {}) =>
          new Promise<void>((done) => {
            const n = ++id;
            pending.set(n, done);
            ws.send(JSON.stringify({ id: n, method, params }));
          }),
      );
    });
    ws.once("close", () => sessions.delete(target.id));
    ws.once("error", reject);
  });
}

/**
 * After launching: waits for the new window's placeholder page, applies the user agent and opens `url` there.
 * Also re-applies the override to pages from an earlier server run (their session closed with it).
 */
export async function prepareTvPage(profileDir: string, userAgent: string, url: string, timeoutMs = 15_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const port = readDevToolsPort(profileDir);
    if (port) {
      try {
        const pages = await listPages(port);
        const blank = pages.find((p) => isPlaceholder(p.url) && !sessions.has(p.id));
        if (blank) {
          const send = await attach(blank);
          await send("Emulation.setUserAgentOverride", { userAgent });
          await send("Page.navigate", { url });
          log.info("tv", `opened ${url} with a TV user agent`);
          await reattach(profileDir, userAgent);
          return;
        }
      } catch {
        // Edge is still starting, or the port file is from a previous run.
      }
    }
    await sleep(200);
  }
  throw new Error("The TV window did not become ready in time");
}

/** Applies the user agent to every page of the profile that has no session yet (no reload). */
export async function reattach(profileDir: string, userAgent: string): Promise<void> {
  const port = readDevToolsPort(profileDir);
  if (!port) return;
  let pages: PageTarget[];
  try {
    pages = await listPages(port);
  } catch {
    return; // Edge isn't running for this profile
  }
  for (const p of pages) {
    if (sessions.has(p.id) || isPlaceholder(p.url) || !/^https?:/.test(p.url)) continue;
    try {
      const send = await attach(p);
      await send("Emulation.setUserAgentOverride", { userAgent });
    } catch (e) {
      log.warn("tv", `could not re-apply the TV user agent: ${(e as Error).message}`);
    }
  }
}
