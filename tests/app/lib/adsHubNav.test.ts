import { describe, expect, it } from "vitest";
import {
  buildAdsHubCatalogPath,
  buildAdsHubConnectPath,
  isAdsHubCapabilityVisible,
  listVisibleAdsHubCapabilities,
  resolveActiveAdsHubCap,
  toAdsHubCatalogPlatform,
  withAdsHubConnectQuery,
} from "../../../app/lib/adsHubNav";

describe("adsHubNav", () => {
  it("hides review-hidden nav items by default", () => {
    const caps = listVisibleAdsHubCapabilities({
      showReviewHidden: false,
    });
    expect(caps.map((c) => c.key)).toEqual([
      "overview",
      "performance",
      "attribution",
      "connect",
    ]);
  });

  it("still hides pixels when not production unless review-hidden is enabled", () => {
    const caps = listVisibleAdsHubCapabilities({
      showReviewHidden: false,
    });
    expect(caps.some((c) => c.key === "pixels")).toBe(false);
  });

  it("checks single capability visibility", () => {
    expect(isAdsHubCapabilityVisible("sync")).toBe(false);
    expect(isAdsHubCapabilityVisible("create")).toBe(false);
    expect(isAdsHubCapabilityVisible("connect")).toBe(true);
    expect(isAdsHubCapabilityVisible("sync", { showReviewHidden: true })).toBe(true);
  });

  it("shows review-hidden capabilities when enabled", () => {
    const caps = listVisibleAdsHubCapabilities({
      showReviewHidden: true,
    });
    expect(caps.map((c) => c.key)).toEqual([
      "overview",
      "performance",
      "attribution",
      "connect",
      "sync",
      "pixels",
      "create",
      "edit",
      "tasks",
    ]);
  });

  it("resolves catalog tab to connect/sync/tasks", () => {
    expect(resolveActiveAdsHubCap("/app/ads/catalog", "?tab=sync")).toBe("sync");
    expect(resolveActiveAdsHubCap("/app/ads/catalog", "?tab=tasks")).toBe("tasks");
    expect(resolveActiveAdsHubCap("/app/ads/catalog", "?tab=credentials")).toBe(
      "connect",
    );
    expect(resolveActiveAdsHubCap("/app/ads/performance", "")).toBe("performance");
    expect(resolveActiveAdsHubCap("/app/ads/performance", "?sandbox=1")).toBe(
      "performance",
    );
  });

  it("builds connect paths with catalog platform aliases", () => {
    expect(toAdsHubCatalogPlatform("meta")).toBe("facebook");
    expect(buildAdsHubCatalogPath({ tab: "credentials", platform: "google" })).toBe(
      "/app/ads/catalog?tab=credentials&platform=google",
    );
    expect(buildAdsHubConnectPath("meta", "?shop=demo.myshopify.com")).toBe(
      "/app/ads/catalog?tab=credentials&platform=facebook&shop=demo.myshopify.com",
    );
    expect(withAdsHubConnectQuery("tiktok", { tiktokAuth: "ok" })).toEqual({
      tiktokAuth: "ok",
      tab: "credentials",
      platform: "tiktok",
    });
  });
});
