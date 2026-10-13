import os from "node:os";

const IGNORED_ADAPTERS = /vEthernet|WSL|VirtualBox|VMware|Loopback|Hyper-V|Docker|Bluetooth/i;

export function lanAddresses(): { lan: string[]; tailscale: string[] } {
  const lan: string[] = [];
  const tailscale: string[] = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (IGNORED_ADAPTERS.test(name)) continue;
    for (const a of addrs ?? []) {
      if (a.family !== "IPv4" || a.internal) continue;
      const [o1, o2] = a.address.split(".").map(Number);
      const isCgnat = o1 === 100 && (o2 ?? 0) >= 64 && (o2 ?? 0) <= 127;
      if (isCgnat || /tailscale/i.test(name)) tailscale.push(a.address);
      else if (!a.address.startsWith("169.254.")) lan.push(a.address);
    }
  }
  return { lan, tailscale };
}

let detectedBase: string | null = null;

/** Remembers the https URL found via the tailscale CLI (null clears it). */
export function setDetectedBase(url: string | null): void {
  detectedBase = url ? url.replace(/\/+$/, "") : null;
}

/** Where a phone should reach this PC: TVDECK_PUBLIC_URL, else a detected `tailscale serve` https URL, else the first LAN IPv4. */
export function publicBase(port: number, env: NodeJS.ProcessEnv = process.env): string {
  const override = env.TVDECK_PUBLIC_URL?.trim();
  if (override) return override.replace(/\/+$/, "");
  if (detectedBase) return detectedBase;
  const { lan, tailscale } = lanAddresses();
  return `http://${lan[0] ?? tailscale[0] ?? "localhost"}:${port}`;
}

/** host[:port] of the configured/detected public URL, or null when pairing uses the plain LAN address. */
export function publicHost(env: NodeJS.ProcessEnv = process.env): string | null {
  const url = env.TVDECK_PUBLIC_URL?.trim() || detectedBase;
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}
