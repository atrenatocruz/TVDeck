/**
 * npm run remote:probe -w @tvdeck/server (or `npm run remote:probe` at the repo root):
 * prints decoded buttons and raw hex from the Xiaomi remote for 60 seconds. Injects nothing.
 */
import { findRemote, loadNodeHid, startHidRemote } from "./hidRemote.ts";
import { HID_DEFAULTS } from "./actions.ts";
import { hex } from "./parseReport.ts";

const SECONDS = 60;
const backend = await loadNodeHid();
const ids = { ...HID_DEFAULTS };
console.log(`Looking for VID 0x${ids.vendorId.toString(16)} PID 0x${ids.productId.toString(16)}, usage page 0x0c ...`);
if (!findRemote(backend.devices(), ids)) console.log("Not found yet; will keep looking. (Is the remote paired and awake? Press a button.)");
console.log(`Press buttons on the remote. Stopping in ${SECONDS}s. Nothing is injected.\n`);

const remote = startHidRemote({
  backend,
  ids: () => ids,
  onDown: () => {},
  onUp: () => {},
  onDisconnect: () => console.log("(disconnected)"),
  onReport: (data, down, up, unknown) => {
    const parts = [...down.map((b) => `+${b}`), ...up.map((b) => `-${b}`), ...unknown.map((u) => `?${u}`)];
    console.log(`${new Date().toTimeString().slice(0, 8)}  ${hex(data).padEnd(30)} ${parts.join(" ") || "(no change)"}`);
  },
});
setTimeout(() => {
  remote.stop();
  console.log("\nDone.");
  process.exit(0);
}, SECONDS * 1000);
process.on("SIGINT", () => {
  remote.stop();
  process.exit(0);
});
