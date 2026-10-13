// Builds app/TVDeck.exe (with the TVDeck icon) from scripts/app/TVDeck.cs: npm run app:build
// Uses the .NET Framework C# compiler that ships with Windows, and `sharp` to draw the icon sizes.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "app");
fs.mkdirSync(out, { recursive: true });

// --- icon: PNG-compressed entries packed into an .ico ---
const svg = fs.readFileSync(path.join(root, "packages", "remote", "public", "icon.svg"));
const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const pngs = await Promise.all(sizes.map((s) => sharp(svg, { density: 384 }).resize(s, s).png().toBuffer()));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(sizes.length, 4);
const dir = Buffer.alloc(16 * sizes.length);
let offset = header.length + dir.length;
sizes.forEach((s, i) => {
  const e = i * 16;
  dir.writeUInt8(s >= 256 ? 0 : s, e); // 0 means 256
  dir.writeUInt8(s >= 256 ? 0 : s, e + 1);
  dir.writeUInt8(0, e + 2); // palette
  dir.writeUInt8(0, e + 3);
  dir.writeUInt16LE(1, e + 4); // planes
  dir.writeUInt16LE(32, e + 6); // bits per pixel
  dir.writeUInt32LE(pngs[i].length, e + 8);
  dir.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
const ico = path.join(out, "TVDeck.ico");
fs.writeFileSync(ico, Buffer.concat([header, dir, ...pngs]));
console.log(`wrote ${path.relative(root, ico)}`);

// --- exe ---
const csc = path.join(process.env.WINDIR ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
if (!fs.existsSync(csc)) {
  console.error(`C# compiler not found at ${csc}`);
  process.exit(1);
}
const exe = path.join(out, "TVDeck.exe");
execFileSync(
  csc,
  [
    "/nologo",
    "/target:winexe",
    "/optimize+",
    `/win32icon:${ico}`,
    "/reference:System.Windows.Forms.dll",
    `/out:${exe}`,
    path.join(root, "scripts", "app", "TVDeck.cs"),
  ],
  { stdio: "inherit" },
);
console.log(`wrote ${path.relative(root, exe)}`);
