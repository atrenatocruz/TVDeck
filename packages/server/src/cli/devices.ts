// npm run devices -- list | revoke <id>     (honours TVDECK_DATA_DIR)
// Edits devices.json directly; a running server notices the change and cuts the device off.
import path from "node:path";
import { readDevicesFile, writeDevicesFile } from "../auth/devices.ts";
import { dataDir } from "../paths.ts";

const file = path.join(dataDir(), "devices.json");
const [cmd, arg] = process.argv.slice(2);

const ago = (t: number) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129_600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86_400)} d ago`;
};

if (cmd === "list") {
  const list = readDevicesFile(file);
  if (list.length === 0) console.log("No paired phones.");
  for (const d of list) console.log(`${d.id}  ${d.name.padEnd(22)} paired ${new Date(d.createdAt).toLocaleDateString()}  last seen ${ago(d.lastSeen)}`);
} else if (cmd === "revoke" && arg) {
  const list = readDevicesFile(file);
  const next = list.filter((d) => d.id !== arg);
  if (next.length === list.length) {
    console.error(`No device with id "${arg}". Run: npm run devices -- list`);
    process.exit(1);
  }
  writeDevicesFile(file, next);
  console.log(`Revoked ${arg}. A running server disconnects it within a second.`);
} else {
  console.error("Usage: npm run devices -- list\n       npm run devices -- revoke <id>");
  process.exit(cmd ? 1 : 0);
}
