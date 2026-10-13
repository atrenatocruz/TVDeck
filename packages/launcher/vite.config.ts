import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/launcher/",
  plugins: [preact()],
  css: { postcss: {} }, // inline: do not search parent folders for a postcss config
  build: { outDir: "dist", emptyOutDir: true, target: "es2022" },
});
