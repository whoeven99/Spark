import { describe, expect, it } from "vitest";
import {
  listVisibleAdsHubCapabilities,
  resolveActiveAdsHubCap,
} from "../../../app/lib/adsHubNav";

describe("adsHubNav", () => {
  it("hides pixel and sandbox in production by default", () => {
    const caps = listVisibleAdsHubCapabilities({
      isProduction: true,
      showReviewHidden: false,
    });
    expect(caps.map((c) => c.key)).toEqual([
      "overview",
      "performance",
      "attribution",
      "connect",
      "sync",
      "create",
      "edit",
      "tasks",
    ]);
  });

  it("shows sandbox when not production", () => {
    const caps = listVisibleAdsHubCapabilities({
      isProduction: false,
      showReviewHidden: false,
    });
    expect(caps.some((c) => c.key === "sandbox")).toBe(true);
    expect(caps.some((c) => c.key === "pixels")).toBe(false);
  });

  it("resolves catalog tab to connect/sync/tasks", () => {
    expect(resolveActiveAdsHubCap("/app/ads/catalog", "?tab=sync")).toBe("sync");
    expect(resolveActiveAdsHubCap("/app/ads/catalog", "?tab=tasks")).toBe("tasks");
    expect(resolveActiveAdsHubCap("/app/ads/catalog", "?tab=credentials")).toBe(
      "connect",
    );
    expect(resolveActiveAdsHubCap("/app/ads/performance", "")).toBe("performance");
  });
});
