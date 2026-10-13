import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
};

export function mimeFor(file: string): string {
  return MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

/** Resolve a URL path inside root; returns null when it would escape root. */
export function safeResolve(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const full = path.resolve(root, "." + path.posix.normalize("/" + decoded.replace(/\\/g, "/")));
  const rel = path.relative(root, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return full;
}

/** Serves files below `mountPath` from `root`, with SPA fallback to index.html. Returns false when not handled. */
export function serveStatic(root: string, mountPath: string, req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? "/", "http://x");
  if (!url.pathname.startsWith(mountPath)) return false;
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405).end();
    return true;
  }
  const rel = url.pathname.slice(mountPath.length);
  let file = safeResolve(root, rel);
  if (!file) {
    res.writeHead(400).end("bad path");
    return true;
  }
  let stat = safeStat(file);
  if (stat?.isDirectory()) {
    file = path.join(file, "index.html");
    stat = safeStat(file);
  }
  if (!stat?.isFile()) {
    if (path.extname(rel)) {
      res.writeHead(404).end("not found");
      return true;
    }
    file = path.join(root, "index.html"); // SPA fallback
    stat = safeStat(file);
    if (!stat?.isFile()) {
      res.writeHead(404).end("remote not built: run `npm run build`");
      return true;
    }
  }
  const immutable = file.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, {
    "Content-Type": mimeFor(file),
    "Content-Length": stat.size,
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  if (req.method === "HEAD") res.end();
  else fs.createReadStream(file).pipe(res);
  return true;
}

function safeStat(p: string): fs.Stats | null {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}
