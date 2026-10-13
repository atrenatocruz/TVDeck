import { describe, expect, it, vi } from "vitest";

vi.mock("./store.ts", async () => {
  const { signal } = await import("@preact/signals");
  return { config: signal(null) };
});

const { dayLabel, skyOf } = await import("./weather.ts");

describe("dayLabel", () => {
  it("writes the weekday and an ordinal day", () => {
    expect(dayLabel(new Date(2026, 9, 13))).toBe("Tuesday, 13th");
    expect(dayLabel(new Date(2026, 9, 1))).toBe("Thursday, 1st");
    expect(dayLabel(new Date(2026, 9, 2))).toBe("Friday, 2nd");
    expect(dayLabel(new Date(2026, 9, 3))).toBe("Saturday, 3rd");
    expect(dayLabel(new Date(2026, 9, 11))).toBe("Sunday, 11th");
    expect(dayLabel(new Date(2026, 9, 22))).toBe("Thursday, 22nd");
    expect(dayLabel(new Date(2026, 9, 31))).toBe("Saturday, 31st");
  });
});

describe("skyOf", () => {
  it("maps WMO codes to icons", () => {
    expect(skyOf(0, true)).toBe("clear");
    expect(skyOf(0, false)).toBe("night");
    expect(skyOf(2, true)).toBe("partly");
    expect(skyOf(3, true)).toBe("cloudy");
    expect(skyOf(45, true)).toBe("fog");
    expect(skyOf(61, true)).toBe("rain");
    expect(skyOf(81, false)).toBe("rain");
    expect(skyOf(73, true)).toBe("snow");
    expect(skyOf(95, true)).toBe("storm");
  });
});
