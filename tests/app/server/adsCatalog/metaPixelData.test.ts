import { beforeEach, describe, expect, it, vi } from "vitest";

const getFacebookCatalogCredential = vi.hoisted(() => vi.fn());
const getMetaAdsCredential = vi.hoisted(() => vi.fn());
const getMetaAdsPixelMetadata = vi.hoisted(() => vi.fn());
const getMetaAdsPixelStats = vi.hoisted(() => vi.fn());

vi.mock("../../../../app/server/adsCatalog/credentialStore.server", () => ({
  getFacebookCatalogCredential: (...args: unknown[]) => getFacebookCatalogCredential(...args),
  getMetaAdsCredential: (...args: unknown[]) => getMetaAdsCredential(...args),
}));

vi.mock("../../../../app/server/adsCatalog/clients/facebookGraphClient.server", () => ({
  getMetaAdsPixelMetadata: (...args: unknown[]) => getMetaAdsPixelMetadata(...args),
  getMetaAdsPixelStats: (...args: unknown[]) => getMetaAdsPixelStats(...args),
}));

import {
  loadMetaPixelDataStats,
  resolveMetaPixelStatsAccessToken,
} from "../../../../app/server/adsCatalog/metaPixelData.server";

describe("resolveMetaPixelStatsAccessToken", () => {
  beforeEach(() => {
    getFacebookCatalogCredential.mockReset();
    getMetaAdsCredential.mockReset();
  });

  it("prefers Meta Ads OAuth token", async () => {
    getMetaAdsCredential.mockResolvedValue({ accessToken: "ads-token", adAccountId: "act_1" });
    getFacebookCatalogCredential.mockResolvedValue({ accessToken: "catalog-token", catalogId: "cat" });

    const result = await resolveMetaPixelStatsAccessToken({ shop: "s.myshopify.com" });
    expect(result).toEqual({ token: "ads-token", source: "meta_ads_oauth" });
  });

  it("falls back to catalog token", async () => {
    getMetaAdsCredential.mockResolvedValue(null);
    getFacebookCatalogCredential.mockResolvedValue({ accessToken: "catalog-token", catalogId: "cat" });

    const result = await resolveMetaPixelStatsAccessToken({ shop: "s.myshopify.com" });
    expect(result).toEqual({ token: "catalog-token", source: "catalog_oauth" });
  });
});

describe("loadMetaPixelDataStats", () => {
  beforeEach(() => {
    getFacebookCatalogCredential.mockReset();
    getMetaAdsCredential.mockReset();
    getMetaAdsPixelMetadata.mockReset();
    getMetaAdsPixelStats.mockReset();
  });

  it("returns empty when pixel not configured", async () => {
    getFacebookCatalogCredential.mockResolvedValue({ accessToken: "tok", catalogId: "cat" });
    const result = await loadMetaPixelDataStats({ shop: "s.myshopify.com" });
    expect(result.configured).toBe(false);
    expect(result.eventTotals).toEqual([]);
  });

  it("loads stats with meta ads token", async () => {
    getFacebookCatalogCredential.mockResolvedValue({
      accessToken: "catalog",
      catalogId: "cat",
      pixelId: "123",
    });
    getMetaAdsCredential.mockResolvedValue({ accessToken: "ads-token", adAccountId: "act_1" });
    getMetaAdsPixelMetadata.mockResolvedValue({
      pixelId: "123",
      name: "Shop Pixel",
      lastFiredTime: "2026-08-10T08:00:00+0000",
      isUnavailable: false,
      eventTimeMin: 1,
      eventTimeMax: 2,
      creationTime: null,
    });
    getMetaAdsPixelStats.mockImplementation(
      async (params: { eventSource?: string; aggregation?: string }) => {
      if (params.eventSource === "WEB_ONLY") {
        return [{ startTime: "", aggregation: "event_total_counts", count: null, rows: [{ value: "PageView", count: 3 }] }];
      }
      if (params.eventSource === "SERVER_ONLY") {
        return [{ startTime: "", aggregation: "event_total_counts", count: null, rows: [{ value: "Purchase", count: 1 }] }];
      }
      if (params.aggregation === "pixel_fire") {
        return [{ startTime: "2026-08-10T08:00:00+0000", aggregation: "pixel_fire", count: 5, rows: [] }];
      }
      return [
        {
          startTime: "",
          aggregation: "event_total_counts",
          count: null,
          rows: [
            { value: "PageView", count: 3 },
            { value: "Purchase", count: 1 },
          ],
        },
      ];
      },
    );

    const result = await loadMetaPixelDataStats({ shop: "s.myshopify.com" });
    expect(result.configured).toBe(true);
    expect(result.tokenSource).toBe("meta_ads_oauth");
    expect(result.metadata?.name).toBe("Shop Pixel");
    expect(result.eventTotals).toEqual([
      { value: "PageView", count: 3 },
      { value: "Purchase", count: 1 },
    ]);
    expect(result.eventTotalsWeb).toEqual([{ value: "PageView", count: 3 }]);
    expect(result.eventTotalsServer).toEqual([{ value: "Purchase", count: 1 }]);
    expect(result.hourlyFires).toEqual([{ hour: "2026-08-10T08:00:00+0000", count: 5 }]);
  });

  it("marks needsMetaAdsConnect on catalog permission errors", async () => {
    getFacebookCatalogCredential.mockResolvedValue({
      accessToken: "catalog",
      catalogId: "cat",
      pixelId: "123",
    });
    getMetaAdsCredential.mockResolvedValue(null);
    getMetaAdsPixelMetadata.mockRejectedValue(new Error("(#200) Missing ads_read permission"));

    const result = await loadMetaPixelDataStats({ shop: "s.myshopify.com" });
    expect(result.permissionError).toContain("ads_read");
    expect(result.needsMetaAdsConnect).toBe(true);
  });
});
