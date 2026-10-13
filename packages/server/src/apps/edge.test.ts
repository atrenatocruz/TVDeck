import { describe, expect, it } from "vitest";
import { buildLauncherArgs, launcherUrl } from "./edge.ts";

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
