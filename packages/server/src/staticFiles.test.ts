import path from "node:path";
import { describe, expect, it } from "vitest";
import { mimeFor, safeResolve } from "./staticFiles.ts";

const root = path.resolve("/srv/dist");

describe("safeResolve", () => {
  it("resolves normal paths inside root", () => {
    expect(safeResolve(root, "assets/app.js")).toBe(path.join(root, "assets", "app.js"));
    expect(safeResolve(root, "")).toBe(root);
  });
  it("blocks traversal in all common spellings", () => {
    expect(safeResolve(root, "../secret.json")).toBe(path.join(root, "secret.json")); // normalised against "/" -> stays inside
    expect(safeResolve(root, "..%2f..%2fetc/passwd")).toBe(path.join(root, "etc", "passwd"));
    expect(safeResolve(root, "a/%00b")).toBeNull();
    expect(safeResolve(root, "%E0%A4%A")).toBeNull();
  });
});

describe("mimeFor", () => {
  it("knows the types we ship", () => {
    expect(mimeFor("a.webmanifest")).toContain("manifest+json");
    expect(mimeFor("a.woff2")).toBe("font/woff2");
    expect(mimeFor("a.unknown")).toBe("application/octet-stream");
  });
});
