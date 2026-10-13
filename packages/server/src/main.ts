import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadOrCreateSecrets } from "./auth/sharedToken.ts";
import { ensureLauncher, registerLauncher } from "./apps/launcher.ts";
import { ensureTilesFile } from "./config/load.ts";
import { watchTiles } from "./config/watch.ts";
import { createHttp } from "./http.ts";
import { log } from "./log.ts";
import { dataDir, TILES_EXAMPLE, TILES_FILE } from "./paths.ts";
import { attachWebSocket } from "./ws.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const version = (JSON.parse(fs.readFileSync(path.join(here, "..", "package.json"), "utf8")) as { version: string }).version;
const production = process.argv.includes("--production") || process.env.NODE_ENV === "production";
const noLauncher = process.argv.includes("--no-launcher") || process.env.TVDECK_NO_LAUNCHER === "1";
const port = Number(process.env.TVDECK_PORT ?? 7420);

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

async function main() {
  const { token, launcherKey } = loadOrCreateSecrets();
  if (ensureTilesFile(TILES_FILE, TILES_EXAMPLE)) log.info("config", `created ${TILES_FILE} from the example`);
  let broadcast: (s: import("./config/watch.ts").TilesState) => void = () => {};
  const tiles = watchTiles(TILES_FILE, (s) => broadcast(s));
  const { server, close } = await createHttp({ production, version });
  const ws = attachWebSocket(server, { sharedToken: token, launcherKey }, version, tiles.current);
  broadcast = ws.broadcastTiles;

  server.on("error", (e: NodeJS.ErrnoException) => {
    log.error("http", e.code === "EADDRINUSE" ? `port ${port} is already in use (set TVDECK_PORT)` : e.message);
    process.exit(1);
  });

  await new Promise<void>((resolve) => server.listen(port, "0.0.0.0", resolve));

  const { lan, tailscale } = lanAddresses();
  const url = (ip: string) => `http://${ip}:${port}/remote/#t=${token}`;
  const bar = "-".repeat(64);
  console.log(`\n${bar}\n  TVDeck ${version}  (${production ? "production" : "dev"})  data: ${dataDir()}\n${bar}`);
  console.log("  Open this on your phone (same Wi-Fi) to pair the remote:\n");
  if (lan.length === 0) console.log("    (no LAN adapter found; use http://localhost:" + port + "/remote/#t=... on this PC)");
  for (const ip of lan) console.log(`    ${url(ip)}`);
  if (tailscale.length) {
    console.log("\n  Tailscale:");
    for (const ip of tailscale) console.log(`    ${url(ip)}`);
  }
  console.log(`\n  This PC: http://localhost:${port}/remote/#t=${token}`);
  console.log("\n  First run: Windows Firewall may ask to allow Node.js - choose Private networks.");
  console.log(`${bar}\n`);
  log.info("http", `listening on 0.0.0.0:${port}`);

  registerLauncher(port, launcherKey);
  if (noLauncher) log.info("launcher", "auto-launch disabled (--no-launcher)");
  else void ensureLauncher(port, launcherKey).catch((e) => log.error("launcher", e instanceof Error ? e.message : String(e)));

  const shutdown = async () => {
    log.info("main", "shutting down");
    ws.close();
    tiles.close();
    await close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  log.error("main", e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
