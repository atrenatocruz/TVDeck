import { execFile } from "node:child_process";
import fs from "node:fs";

/** Subset of `tailscale status --json` we need. */
interface TsStatus {
  BackendState?: string;
  Self?: { DNSName?: string };
}

/** Subset of `tailscale serve status --json`. */
interface TsServe {
  TCP?: Record<string, { HTTPS?: boolean; HTTP?: boolean; TCPForward?: string } | undefined>;
  Web?: Record<string, { Handlers?: Record<string, { Proxy?: string; Path?: string; Text?: string } | undefined> } | undefined>;
}

const LOCAL_PROXY = /^(?:https?(?:\+insecure)?:\/\/)?(?:127\.0\.0\.1|localhost|\[::1\]):(\d+)(?:\/.*)?$/i;

const parseJson = <T>(raw: string): T | null => {
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as T) : null;
  } catch {
    return null;
  }
};

/** The tailnet DNS name of this PC without the trailing dot, or null when Tailscale is not running. */
export function parseSelfDnsName(statusJson: string): string | null {
  const s = parseJson<TsStatus>(statusJson);
  if (!s) return null;
  if (s.BackendState && s.BackendState !== "Running") return null;
  const name = s.Self?.DNSName?.trim().replace(/\.+$/, "");
  return name ? name : null;
}

/**
 * Looks for an HTTPS `tailscale serve` handler that proxies to our port and returns the public base URL
 * (https://host, or https://host:port when it is not served on 443). Pure: takes the two JSON documents.
 */
export function parseServeBase(statusJson: string, serveJson: string, port: number): string | null {
  const host = parseSelfDnsName(statusJson);
  const serve = parseJson<TsServe>(serveJson);
  if (!host || !serve?.Web) return null;
  for (const [hostPort, web] of Object.entries(serve.Web)) {
    const m = /^(.*):(\d+)$/.exec(hostPort);
    if (!m) continue;
    const listenPort = m[2]!;
    if (!serve.TCP?.[listenPort]?.HTTPS) continue; // only https serves make the PWA installable
    for (const h of Object.values(web?.Handlers ?? {})) {
      const pm = h?.Proxy ? LOCAL_PROXY.exec(h.Proxy.trim()) : null;
      if (pm && Number(pm[1]) === port) return listenPort === "443" ? `https://${host}` : `https://${host}:${listenPort}`;
    }
  }
  return null;
}

type Run = (cmd: string, args: string[]) => Promise<string | null>;

const WINDOWS_CLI = "C:\Program Files\Tailscale\tailscale.exe";

/** Runs a command with a 2 s timeout. Resolves null when it is missing, fails or times out. */
export const runCli: Run = (cmd, args) =>
  new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout: 2000, windowsHide: true, maxBuffer: 1 << 20 }, (err, stdout) => resolve(err ? null : stdout));
    } catch {
      resolve(null);
    }
  });

/** Asks the tailscale CLI whether `tailscale serve` exposes this port over HTTPS. Never throws. */
export async function detectTailscaleBase(port: number, run: Run = runCli, cliCandidates: string[] = defaultCli()): Promise<string | null> {
  for (const cli of cliCandidates) {
    const status = await run(cli, ["status", "--json"]);
    if (status === null) continue; // not this binary (or not installed)
    if (!parseSelfDnsName(status)) return null; // installed but not running
    const serve = await run(cli, ["serve", "status", "--json"]);
    return serve === null ? null : parseServeBase(status, serve, port);
  }
  return null;
}

function defaultCli(): string[] {
  const list = ["tailscale"];
  if (process.platform === "win32" && fs.existsSync(WINDOWS_CLI)) list.push(WINDOWS_CLI);
  return list;
}
