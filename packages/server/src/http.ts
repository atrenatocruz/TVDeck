import http from "node:http";
import os from "node:os";
import { REMOTE_DIST, REMOTE_ROOT } from "./paths.ts";
import { serveStatic } from "./staticFiles.ts";

export interface HttpHandle {
  server: http.Server;
  close(): Promise<void>;
}

export async function createHttp(opts: { production: boolean; version: string }): Promise<HttpHandle> {
  const server = http.createServer();
  const startedAt = Date.now();

  let viteMiddleware: ((req: http.IncomingMessage, res: http.ServerResponse, next: (e?: unknown) => void) => void) | null = null;
  let viteClose: (() => Promise<void>) | null = null;

  if (!opts.production) {
    const { createServer } = await import("vite");
    const { default: preact } = await import("@preact/preset-vite");
    const vite = await createServer({
      root: REMOTE_ROOT,
      configFile: false, // inline config: a temp config file in node_modules would retrigger tsx watch
      plugins: [preact()],
      css: { postcss: {} },
      base: "/remote/",
      appType: "spa",
      logLevel: "warn",
      server: { middlewareMode: true, hmr: { server } },
    });
    viteMiddleware = vite.middlewares;
    viteClose = () => vite.close();
  }

  server.on("request", (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");

    if (url.pathname === "/") {
      res.writeHead(302, { Location: "/remote/" }).end();
      return;
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
      if (viteMiddleware) {
        viteMiddleware(req, res, () => res.writeHead(404).end("not found"));
        return;
      }
      if (serveStatic(REMOTE_DIST, "/remote/", req, res)) return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
  });

  return {
    server,
    async close() {
      await viteClose?.();
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
