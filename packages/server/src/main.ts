import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Devices, watchDevices } from "./auth/devices.ts";
import { Pairing } from "./auth/pairing.ts";
import { loadOrCreateSecrets } from "./auth/sharedToken.ts";
import { ensureLauncher, registerLauncher, startLauncherWatchdog } from "./apps/launcher.ts";
import { createAppService } from "./apps/service.ts";
import { ensureTilesFile } from "./config/load.ts";
import { watchTiles } from "./config/watch.ts";
import { createHttp } from "./http.ts";
import { lanAddresses, publicBase, publicHost, setDetectedBase } from "./lan.ts";
import { enableFileLog, log } from "./log.ts";
import { dataDir, LAUNCHER_DIST, REMOTE_DIST, TILES_EXAMPLE, TILES_FILE } from "./paths.ts";
import { detectTailscaleBase } from "./tailscale.ts";
import { attachWebSocket } from "./ws.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const version = (JSON.parse(fs.readFileSync(path.join(here, "..", "package.json"), "utf8")) as { version: string }).version;
const production = process.argv.includes("--production") || process.env.NODE_ENV === "production";
const noLauncher = process.argv.includes("--no-launcher") || process.env.TVDECK_NO_LAUNCHER === "1";
const port = Number(process.env.TVDECK_PORT ?? 7420);

const bind = process.env.TVDECK_BIND?.trim() || "0.0.0.0";

async function main() {
  enableFileLog(path.join(dataDir(), "logs", "tvdeck.log"));
  if (production) {
    const missing = [["remote", REMOTE_DIST], ["launcher", LAUNCHER_DIST]].filter(([, d]) => !fs.existsSync(path.join(d!, "index.html")));
    if (missing.length) {
      log.error("main", `the ${missing.map(([n]) => n).join(" and ")} app has not been built. Run "npm run build" first, then "npm start".`);
      process.exit(1);
    }
  }
  const { token, launcherKey } = loadOrCreateSecrets();
  if (ensureTilesFile(TILES_FILE, TILES_EXAMPLE)) log.info("config", `created ${TILES_FILE} from the example`);
  let broadcast: (s: import("./config/watch.ts").TilesState) => void = () => {};
  const tiles = watchTiles(TILES_FILE, (s) => broadcast(s));
  const { server, close } = await createHttp({ production, version });
  let broadcastState: (s: import("./apps/service.ts").StateMsg) => void = () => {};
  const apps = createAppService(
    () => tiles.current().config.rows.flatMap((r) => r.tiles),
    (s) => broadcastState(s),
  );
  const allowShared = process.env.TVDECK_ALLOW_SHARED_TOKEN === "1";
  if (allowShared) log.warn("auth", "TVDECK_ALLOW_SHARED_TOKEN=1: the shared token is accepted. Prefer pairing; unset this when done.");
  const devices = new Devices(path.join(dataDir(), "devices.json"));
  const ctx = { sharedToken: token, launcherKey, allowShared, devices, pairing: new Pairing() };
  const ws = attachWebSocket(server, ctx, version, tiles.current, apps, { publicBase: () => publicBase(port), publicHost: () => publicHost() });
  // The CLI (npm run devices) edits devices.json directly: pick that up and cut revoked sockets.
  const devWatch = watchDevices(devices, (ids) => ws.closeDevices(ids), () => ws.broadcastDevices());
  broadcast = ws.broadcastTiles;
  broadcastState = ws.broadcastState;

  server.on("error", (e: NodeJS.ErrnoException) => {
    log.error("http", e.code === "EADDRINUSE" ? `port ${port} is already in use (set TVDECK_PORT)` : e.message);
    process.exit(1);
  });

  await new Promise<void>((resolve) => server.listen(port, bind, resolve));

  // Pairing base: TVDECK_PUBLIC_URL, else https from `tailscale serve` if configured for this port, else the LAN.
  if (process.env.TVDECK_PUBLIC_URL?.trim()) log.info("net", `pairing base from TVDECK_PUBLIC_URL: ${publicBase(port)}`);
  else {
    const ts = await detectTailscaleBase(port);
    setDetectedBase(ts);
    log.info("net", ts ? `pairing base from tailscale serve: ${ts}` : `no tailscale serve for port ${port} (or tailscale CLI not found); pairing base is the LAN address ${publicBase(port)}`);
  }

  const { lan, tailscale } = lanAddresses();
  const bar = "-".repeat(64);
  console.log(`\n${bar}\n  TVDeck ${version}  (${production ? "production" : "dev"})  data: ${dataDir()}\n${bar}`);
  console.log("  Pair a phone: open the launcher (it shows a QR code).\n");
  console.log(`  Phone address: ${publicBase(port)}`);
  if (lan.length > 1) console.log(`  Other adapters: ${lan.slice(1).map((ip) => `http://${ip}:${port}`).join("  ")}`);
  if (tailscale.length) console.log(`  Tailscale: ${tailscale.map((ip) => `http://${ip}:${port}`).join("  ")}`);
  if (devices.listInfo().length === 0) console.log("\n  No phones are paired yet.");
  console.log("\n  First run: Windows Firewall may ask to allow Node.js - choose Private networks.");
  console.log(`${bar}\n`);
  log.info("http", `listening on ${bind}:${port}`);

  let stopWatchdog = () => {};
  registerLauncher(port, launcherKey);
  apps.start();
  if (noLauncher) log.info("launcher", "auto-launch disabled (--no-launcher)");
  else {
    void ensureLauncher(port, launcherKey).catch((e) => log.error("launcher", e instanceof Error ? e.message : String(e)));
    stopWatchdog = startLauncherWatchdog(port, launcherKey);
  }

  const shutdown = async () => {
    log.info("main", "shutting down");
    stopWatchdog();
    apps.stop();
    ws.close();
    tiles.close();
    devWatch.close();
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
