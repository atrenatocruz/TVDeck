import { describe, expect, it } from "vitest";
import { countdown, relativeTime } from "./format.ts";

const NOW = 1_700_000_000_000;
describe("relativeTime", () => {
  it("buckets", () => {
    expect(relativeTime(NOW - 5_000, NOW)).toBe("just now");
    expect(relativeTime(NOW - 10 * 60_000, NOW)).toBe("10 minutes ago");
    expect(relativeTime(NOW - 3 * 3_600_000, NOW)).toBe("3 hours ago");
    expect(relativeTime(NOW - 26 * 3_600_000, NOW)).toBe("yesterday");
    expect(relativeTime(NOW - 4 * 86_400_000, NOW)).toBe("4 days ago");
  });
});
describe("countdown", () => {
  it("formats m:ss", () => {
    expect(countdown(272_000)).toBe("4:32");
    expect(countdown(300_000)).toBe("5:00");
    expect(countdown(-5)).toBe("0:00");
  });
});
