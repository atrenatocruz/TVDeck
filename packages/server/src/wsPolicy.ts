import type { Hello } from "@tvdeck/protocol";
import type { Devices } from "./auth/devices.ts";
import type { Pairing } from "./auth/pairing.ts";
import { checkToken } from "./auth/sharedToken.ts";

export interface OriginContext {
  /** host[:port] of TVDECK_PUBLIC_URL or the detected `tailscale serve` URL. */
  publicHost?: string | null;
  /** X-Forwarded-Host request header (only trusted when the socket peer is loopback). */
  forwardedHost?: string | string[];
  /** Socket peer address. */
  remoteAddress?: string;
}

const isLoopback = (a: string | undefined) => !!a && (a === "::1" || a === "127.0.0.1" || a.startsWith("::ffff:127.") || a.startsWith("127."));

/**
 * Browsers always send Origin on WebSocket upgrades. We require it, and require it to match the Host
 * the client reached us at (blocks cross-site WebSocket hijacking).
 *
 * Behind `tailscale serve` (a reverse proxy on 127.0.0.1) the Host header should be the public
 * name, but to be safe against proxies that rewrite it we also accept an Origin that equals the
 * configured public URL host, or, when the peer is loopback, the proxy's X-Forwarded-Host.
 * A web page on another site can never carry an Origin equal to those, so this stays safe.
 */
export function isOriginAllowed(origin: string | undefined, host: string | undefined, ctx: OriginContext = {}): boolean {
  if (!origin || !host) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  if (originHost === host) return true;
  const o = originHost.toLowerCase();
  if (o === host.toLowerCase()) return true;
  if (ctx.publicHost && o === ctx.publicHost.toLowerCase()) return true;
  if (isLoopback(ctx.remoteAddress)) {
    const fwd = (Array.isArray(ctx.forwardedHost) ? ctx.forwardedHost[0] : ctx.forwardedHost)?.split(",")[0]?.trim().toLowerCase();
    if (fwd && o === fwd) return true;
  }
  return false;
}

export interface AuthContext {
  sharedToken: string;
  launcherKey: string;
  /** The legacy shared token is only honoured when TVDECK_ALLOW_SHARED_TOKEN=1. */
  allowShared: boolean;
  devices: Devices;
  pairing: Pairing;
}

export type AuthDecision =
  | { ok: true; role: "remote" | "launcher"; deviceId?: string; paired?: { deviceId: string; deviceToken: string } }
  | { ok: false };

/** Decision for one hello: which role (if any) does it earn? A valid pairing code is consumed here. */
export function decideAuth(hello: Hello, ctx: AuthContext): AuthDecision {
  const { role, auth } = hello;
  if (role === "launcher") {
    return auth.kind === "launcher" && checkToken(ctx.launcherKey, auth.key) ? { ok: true, role: "launcher" } : { ok: false };
  }
  switch (auth.kind) {
    case "shared":
      return ctx.allowShared && checkToken(ctx.sharedToken, auth.token) ? { ok: true, role: "remote" } : { ok: false };
    case "device": {
      const d = ctx.devices.verify(auth.token);
      return d ? { ok: true, role: "remote", deviceId: d.id } : { ok: false };
    }
    case "pair": {
      if (!ctx.pairing.redeem(auth.code)) return { ok: false };
      const { device, token } = ctx.devices.create(auth.deviceName);
      return { ok: true, role: "remote", deviceId: device.id, paired: { deviceId: device.id, deviceToken: token } };
    }
    default:
      return { ok: false };
  }
}
