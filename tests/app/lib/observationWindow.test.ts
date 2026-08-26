import { describe, expect, it } from "vitest";
import {
  formatCompleteUtcWindowParts,
  resolveCompleteUtcWindow,
  resolveDisplayTimeZone,
  toObservationWindowView,
} from "../../../app/lib/observationWindow";

describe("resolveCompleteUtcWindow", () => {
  it("uses complete UTC days and excludes today", () => {
    const now = new Date("2026-08-26T12:00:00.000Z");
    const { start, end } = resolveCompleteUtcWindow(7, now);

    expect(start.toISOString()).toBe("2026-08-19T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-26T00:00:00.000Z");
  });

  it("still excludes today just after UTC midnight", () => {
    const now = new Date("2026-08-26T00:05:00.000Z");
    const { start, end } = resolveCompleteUtcWindow(7, now);

    expect(start.toISOString()).toBe("2026-08-19T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-26T00:00:00.000Z");
  });
});

describe("formatCompleteUtcWindowParts", () => {
  const now = new Date("2026-08-26T07:05:00.000Z");
  const window = toObservationWindowView(7, now, "Asia/Shanghai");

  it("keeps UTC calendar dates when formatting in a +8 shop timezone", () => {
    const parts = formatCompleteUtcWindowParts(window, "zh");
    expect(parts.start).toBe("8月19日");
    expect(parts.end).toBe("8月25日");
    expect(parts.tz).toMatch(/GMT\+0?8/);
  });

  it("keeps UTC calendar dates when formatting in a US shop timezone", () => {
    const nyWindow = toObservationWindowView(7, now, "America/New_York");
    const parts = formatCompleteUtcWindowParts(nyWindow, "en");
    expect(parts.start).toBe("Aug 19");
    expect(parts.end).toBe("Aug 25");
  });

  it("falls back to UTC for an invalid timezone", () => {
    expect(resolveDisplayTimeZone("Not/AZone")).toBe("UTC");
  });
});
