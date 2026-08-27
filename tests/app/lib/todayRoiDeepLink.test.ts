import { describe, expect, it } from "vitest";
import {
  mapLegacyRoiValueTab,
  resolveRoiFocus,
  shouldOpenRoiCostSettings,
  stripConsumedRoiDeepLinkParams,
} from "../../../app/lib/todayRoiDeepLink";

describe("mapLegacyRoiValueTab", () => {
  it("maps channels to focus", () => {
    expect(mapLegacyRoiValueTab("channels")).toEqual({ focus: "channels" });
  });

  it("maps cost to settings", () => {
    expect(mapLegacyRoiValueTab("cost")).toEqual({ settings: "cost" });
  });

  it("drops framework and customers onto overview", () => {
    expect(mapLegacyRoiValueTab("framework")).toEqual({});
    expect(mapLegacyRoiValueTab("customers")).toEqual({});
    expect(mapLegacyRoiValueTab(null)).toEqual({});
  });
});

describe("resolveRoiFocus", () => {
  it("prefers an explicit focus over leftover valueTab", () => {
    const params = new URLSearchParams("focus=loss&valueTab=channels");
    expect(resolveRoiFocus(params)).toBe("loss");
  });

  it("treats leftover valueTab=channels as channels focus", () => {
    expect(resolveRoiFocus(new URLSearchParams("valueTab=channels"))).toBe("channels");
  });

  it("falls back to overview for customers and unknown tabs", () => {
    expect(resolveRoiFocus(new URLSearchParams("valueTab=customers"))).toBe("overview");
    expect(resolveRoiFocus(new URLSearchParams("valueTab=cost"))).toBe("overview");
    expect(resolveRoiFocus(new URLSearchParams())).toBe("overview");
  });
});

describe("shouldOpenRoiCostSettings", () => {
  it("opens from settings=cost or leftover valueTab=cost", () => {
    expect(shouldOpenRoiCostSettings(new URLSearchParams("settings=cost"))).toBe(true);
    expect(shouldOpenRoiCostSettings(new URLSearchParams("valueTab=cost"))).toBe(true);
    expect(shouldOpenRoiCostSettings(new URLSearchParams("valueTab=channels"))).toBe(false);
  });
});

describe("stripConsumedRoiDeepLinkParams", () => {
  it("rewrites leftover valueTab=channels to focus", () => {
    const next = stripConsumedRoiDeepLinkParams(new URLSearchParams("valueTab=channels"));
    expect(next?.toString()).toBe("focus=channels");
  });

  it("keeps an explicit loss focus when stripping valueTab", () => {
    const next = stripConsumedRoiDeepLinkParams(
      new URLSearchParams("focus=loss&valueTab=channels"),
    );
    expect(next?.toString()).toBe("focus=loss");
  });

  it("rewrites leftover valueTab=cost to settings=cost", () => {
    const next = stripConsumedRoiDeepLinkParams(
      new URLSearchParams("valueTab=cost&returnTo=%2Fapp%2Ftoday"),
    );
    expect(next?.toString()).toBe("returnTo=%2Fapp%2Ftoday&settings=cost");
  });

  it("returns null when the URL is already canonical", () => {
    expect(stripConsumedRoiDeepLinkParams(new URLSearchParams("focus=channels"))).toBeNull();
    expect(stripConsumedRoiDeepLinkParams(new URLSearchParams("settings=cost"))).toBeNull();
  });
});
