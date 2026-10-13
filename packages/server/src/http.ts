import http from "node:http";
import os from "node:os";
import { ICONS_DIR, LAUNCHER_DIST, LAUNCHER_ROOT, REMOTE_DIST, REMOTE_ROOT } from "./paths.ts";
import { serveStatic } from "./staticFiles.ts";

export interface HttpHandle {
  server: http.Server;
  close(): Promise<void>;
}

export async function createHttp(opts: { production: boolean; version: string }): Promise<HttpHandle> {
  const server = http.createServer();
  const startedAt = Date.now();

  type Middleware = (req: http.IncomingMessage, res: http.ServerResponse, next: (e?: unknown) => void) => void;
  const vites = new Map<string, Middleware>();
  const closers: Array<() => Promise<void>> = [];

  if (!opts.production) {
    const { createServer } = await import("vite");
    const { default: preact } = await import("@preact/preset-vite");
    for (const [mount, root] of [["remote", REMOTE_ROOT], ["launcher", LAUNCHER_ROOT]] as const) {
      const vite = await createServer({
        root,
        configFile: false, // inline config: a temp config file in node_modules would retrigger tsx watch
        plugins: [preact()],
        css: { postcss: {} }, // do not search parent folders (e.g. the home folder) for a postcss config
        base: `/${mount}/`,
        appType: "spa",
        logLevel: "warn",
        server: { middlewareMode: true, hmr: { server } },
      });
      vites.set(mount, vite.middlewares);
      closers.push(() => vite.close());
    }
  }

  server.on("request", (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");

    if (url.pathname === "/") {
      res.writeHead(302, { Location: "/remote/" }).end();
      return;
    }
    if (url.pathname.startsWith("/icons/")) {
      if (serveStatic(ICONS_DIR, "/icons/", req, res)) return;
    }
    if (url.pathname === "/launcher") {
      res.writeHead(302, { Location: "/launcher/" + url.search }).end();
      return;
    }
    if (url.pathname.startsWith("/launcher/")) {
      const mw = vites.get("launcher");
      if (mw) return void mw(req, res, () => res.writeHead(404).end("not found"));
      if (serveStatic(LAUNCHER_DIST, "/launcher/", req, res)) return;
    }
    if (url.pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ ok: true, name: os.hostname(), version: opts.version, uptime: Math.round((Date.now() - startedAt) / 1000), mode: opts.production ? "production" : "dev" }));
      return;
    }
    if (url.pathname === "/remote" ) {
      res.writeHead(302, { Location: "/remote/" + url.search }).end();
      return;
    }
    if (url.pathname.startsWith("/remote/")) {
      const mw = vites.get("remote");
      if (mw) return void mw(req, res, () => res.writeHead(404).end("not found"));
      if (serveStatic(REMOTE_DIST, "/remote/", req, res)) return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
  });

  return {
    server,
    async close() {
      for (const c of closers) await c();
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
