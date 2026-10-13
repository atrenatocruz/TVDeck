import type { Hello } from "@tvdeck/protocol";
import type { Devices } from "./auth/devices.ts";
import type { Pairing } from "./auth/pairing.ts";
import { checkToken } from "./auth/sharedToken.ts";

/**
 * Browsers always send Origin on WebSocket upgrades. We require it, and require it to
 * match the Host the client reached us at (blocks cross-site WebSocket hijacking).
 */
export function isOriginAllowed(origin: string | undefined, host: string | undefined): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
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
