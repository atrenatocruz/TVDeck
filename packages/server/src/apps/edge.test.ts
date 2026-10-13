import { describe, expect, it } from "vitest";
import { buildLauncherArgs, buildWebArgs, launcherUrl, resolveUserAgent, TV_USER_AGENT } from "./edge.ts";

describe("buildLauncherArgs", () => {
  const args = buildLauncherArgs({ dataDir: "C:\\Data\\TVDeck", port: 7420, key: "ab-_c" });
  it("uses an isolated profile, app mode and fullscreen", () => {
    expect(args).toContain("--user-data-dir=C:\\Data\\TVDeck\\edge-launcher");
    expect(args).toContain("--app=http://localhost:7420/launcher/#k=ab-_c");
    expect(args).toContain("--start-fullscreen");
    expect(args).toContain("--autoplay-policy=no-user-gesture-required");
  });
  it("puts the key in the fragment, never the query", () => {
    expect(launcherUrl(1, "k")).toBe("http://localhost:1/launcher/#k=k");
    expect(launcherUrl(1, "a b")).toContain("#k=a%20b");
  });
});

describe("buildWebArgs", () => {
  const args = buildWebArgs({ dataDir: "C:\\Data\\TVDeck", url: "https://www.youtube.com" });
  it("uses the persistent apps profile, app mode and fullscreen", () => {
    expect(args).toContain("--user-data-dir=C:\\Data\\TVDeck\\edge-apps");
    expect(args).toContain("--app=https://www.youtube.com");
    expect(args).toContain("--start-fullscreen");
    expect(args).toContain("--no-first-run");
    expect(args).toContain("--no-default-browser-check");
    expect(args).toContain("--autoplay-policy=no-user-gesture-required");
  });
});

describe("buildWebArgs with a user agent", () => {
  it("gives the TV user agent its own profile and passes it to Edge", () => {
    const args = buildWebArgs({ dataDir: "C:\\Data\\TVDeck", url: "https://www.youtube.com/tv", userAgent: resolveUserAgent("tv") });
    expect(args).toContain("--user-data-dir=C:\\Data\\TVDeck\\edge-apps-tv");
    expect(args).toContain(`--user-agent=${TV_USER_AGENT}`);
  });

  it("hashes custom user agents into a stable profile name", () => {
    const a = buildWebArgs({ dataDir: "C:\\D", url: "https://x", userAgent: "Custom/1.0" });
    expect(a[0]).toMatch(/^--user-data-dir=C:\\D\\edge-apps-[0-9a-f]{8}$/);
    expect(buildWebArgs({ dataDir: "C:\\D", url: "https://x", userAgent: "Custom/1.0" })[0]).toBe(a[0]);
    expect(resolveUserAgent(undefined)).toBeUndefined();
  });
});

describe("buildWebArgs D-pad mode", () => {
  it("adds Edge's spatial navigation only when asked", () => {
    expect(buildWebArgs({ dataDir: "C:\\D", url: "https://x", spatialNav: true })).toContain("--enable-spatial-navigation");
    expect(buildWebArgs({ dataDir: "C:\\D", url: "https://x" })).not.toContain("--enable-spatial-navigation");
  });
});
