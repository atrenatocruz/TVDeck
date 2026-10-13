// Regenerates the PWA PNG icons from the SVG sources: npm run icons
// (needs the `sharp` devDependency; the PNGs are committed, so a normal build does not run this.)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "packages", "remote");
const any = fs.readFileSync(path.join(root, "public", "icon.svg"));
const bleed = fs.readFileSync(path.join(root, "icons-src", "icon-bleed.svg"));
const out = path.join(root, "public", "icons");
fs.mkdirSync(out, { recursive: true });

const jobs = [
  ["icon-192.png", any, 192],
  ["icon-512.png", any, 512],
  ["icon-maskable-512.png", bleed, 512],
  ["apple-touch-icon.png", bleed, 180],
];
for (const [name, svg, size] of jobs) {
  await sharp(svg, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(out, name));
  console.log(`wrote ${path.relative(process.cwd(), path.join(out, name))} (${size}x${size})`);
}
