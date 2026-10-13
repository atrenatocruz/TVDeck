import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import preact from "@preact/preset-vite";
import { defineConfig, type Plugin } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Writes dist/sw.js from sw.template.js: the cache name carries a hash of the build output, and the
 * precache list is every file in dist, so a new build always replaces the old cache.
 */
function serviceWorker(): Plugin {
  let outDir = "dist";
  return {
    name: "tvdeck-sw",
    apply: "build",
    configResolved(c) {
      outDir = path.resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) walk(full);
          else files.push(path.relative(outDir, full).split(path.sep).join("/"));
        }
      };
      walk(outDir);
      const shell = files.filter((f) => f !== "sw.js" && !f.endsWith(".map")).sort();
      const template = fs.readFileSync(path.resolve(here, "sw.template.js"), "utf8");
      const hash = crypto.createHash("sha256").update(template);
      for (const f of shell) hash.update(f).update(fs.readFileSync(path.join(outDir, f)));
      const version = hash.digest("hex").slice(0, 10);
      const precache = ["/remote/", ...shell.map((f) => `/remote/${f}`)];
      fs.writeFileSync(path.join(outDir, "sw.js"), template.replace("__VERSION__", version).replace("__PRECACHE__", JSON.stringify(precache)));
    },
  };
}


export default defineConfig({
  base: "/remote/",
  plugins: [preact(), serviceWorker()],
  css: { postcss: {} }, // inline: do not search parent folders for a postcss config
  build: { outDir: "dist", emptyOutDir: true, target: "es2022" },
});
