import { describe, expect, it } from "vitest";
import { googleDateClause, parseRangeDays, resolveDateWindow } from "~/server/adsInsights/dateRange.server";
import { mergeEntityAdsWithFlatMetrics, nestEntityHierarchy, nestFlatAdRows, mergeMetrics } from "~/server/adsInsights/nest.server";
import { emptyMetrics, finalizeMetrics, parseAdsInsightsView } from "~/server/adsInsights/types.server";

describe("adsInsights dateRange", () => {
  it("parses allowed ranges and defaults to 7", () => {
    expect(parseRangeDays("14")).toBe(14);
    expect(parseRangeDays("30")).toBe(30);
    expect(parseRangeDays("9")).toBe(7);
    expect(parseRangeDays(null)).toBe(7);
  });

  it("builds explicit Google date clauses", () => {
    // 用显式区间而非 LAST_N_DAYS：预置区间不含当天，落库后切窗口会缺当天。
    expect(googleDateClause("2026-07-08", "2026-07-14")).toBe(
      "segments.date BETWEEN '2026-07-08' AND '2026-07-14'",
    );
  });

  it("resolves inclusive UTC windows", () => {
    const now = new Date("2026-07-14T12:00:00.000Z");
    expect(resolveDateWindow(7, now)).toEqual({
      dateStart: "2026-07-08",
      dateEnd: "2026-07-14",
    });
  });
});

describe("adsInsights nest", () => {
  it("nests ad rows and rolls metrics up", () => {
    const campaigns = nestFlatAdRows([
      {
        campaignId: "c1",
        campaignName: "Campaign 1",
        campaignStatus: "ENABLED",
        adSetId: "s1",
        adSetName: "AdSet 1",
        adSetStatus: "ENABLED",
        adId: "a1",
        adName: "Ad 1",
        adStatus: "ENABLED",
        metrics: finalizeMetrics({
          impressions: 100,
          clicks: 10,
          spend: 20,
          conversions: 2,
          conversionsValue: 40,
          purchases: 2,
          purchaseValue: 40,
          addToCart: 5,
          landingPageViews: 8,
          reach: 50,
          frequency: 2,
        }),
      },
      {
        campaignId: "c1",
        campaignName: "Campaign 1",
        campaignStatus: "ENABLED",
        adSetId: "s1",
        adSetName: "AdSet 1",
        adSetStatus: "ENABLED",
        adId: "a2",
        adName: "Ad 2",
        adStatus: "ENABLED",
        metrics: finalizeMetrics({
          impressions: 50,
          clicks: 5,
          spend: 10,
          conversions: 1,
          conversionsValue: 20,
          purchases: 1,
          purchaseValue: 20,
          addToCart: 2,
          landingPageViews: 3,
          reach: 25,
          frequency: 2,
        }),
      },
    ]);

    expect(campaigns).toHaveLength(1);
    expect(campaigns[0].adSets).toHaveLength(1);
    expect(campaigns[0].adSets[0].ads).toHaveLength(2);
    expect(campaigns[0].metrics.spend).toBe(30);
    expect(campaigns[0].metrics.purchases).toBe(3);
    expect(campaigns[0].metrics.roas).toBe(2);
  });

  it("keeps null extended metrics null when both sides missing", () => {
    const merged = mergeMetrics(
      finalizeMetrics({ impressions: 1, clicks: 1, spend: 1 }),
      finalizeMetrics({ impressions: 1, clicks: 1, spend: 1 }),
    );
    expect(merged.reach).toBeNull();
    expect(merged.purchases).toBeNull();
    expect(merged.videoViews).toBeNull();
    expect(merged.allConversions).toBeNull();
  });

  it("derives cpm and sums extended metrics", () => {
    const merged = mergeMetrics(
      finalizeMetrics({
        impressions: 1000,
        clicks: 10,
        spend: 20,
        videoViews: 5,
        allConversions: 2,
      }),
      finalizeMetrics({
        impressions: 1000,
        clicks: 10,
        spend: 20,
        videoViews: 3,
        allConversions: 1,
      }),
    );
    expect(merged.cpm).toBe(20);
    expect(merged.videoViews).toBe(8);
    expect(merged.allConversions).toBe(3);
  });
});

describe("adsInsights view parse", () => {
  it("parses deep views and defaults to structure", () => {
    expect(parseAdsInsightsView("keywords")).toBe("keywords");
    expect(parseAdsInsightsView("searchTerms")).toBe("searchTerms");
    expect(parseAdsInsightsView("creatives")).toBe("creatives");
    expect(parseAdsInsightsView("nope")).toBe("structure");
    expect(parseAdsInsightsView(null)).toBe("structure");
  });
});

describe("adsInsights mergeEntityAdsWithFlatMetrics", () => {
  it("keeps all entity ads with empty metrics when report is empty", () => {
    const ads = mergeEntityAdsWithFlatMetrics(
      [
        {
          id: "a1",
          name: "Ad 1",
          status: "DISABLE",
          campaignId: "c1",
          adSetId: "s1",
        },
        {
          id: "a2",
          name: "Ad 2",
          status: "DISABLE",
          campaignId: "c2",
          adSetId: "s2",
        },
      ],
      [],
    );
    expect(ads).toHaveLength(2);
    expect(ads[0].metrics).toEqual(emptyMetrics());
    expect(ads[1].metrics).toEqual(emptyMetrics());
  });

  it("merges report metrics and keeps campaigns without delivery", () => {
    const ads = mergeEntityAdsWithFlatMetrics(
      [
        {
          id: "a1",
          name: "Ad 1",
          status: "DISABLE",
          campaignId: "c1",
          adSetId: "s1",
        },
        {
          id: "a2",
          name: "Ad 2",
          status: "DISABLE",
          campaignId: "c2",
          adSetId: "s2",
        },
      ],
      [
        {
          campaignId: "c1",
          campaignName: "Campaign 1",
          campaignStatus: "DISABLE",
          adSetId: "s1",
          adSetName: "AdSet 1",
          adSetStatus: "DISABLE",
          adId: "a1",
          adName: "Ad 1",
          adStatus: "DISABLE",
          metrics: finalizeMetrics({
            impressions: 10,
            clicks: 1,
            spend: 2,
          }),
        },
      ],
    );

    const campaigns = nestEntityHierarchy({
      campaigns: [
        { id: "c1", name: "Campaign 1", status: "DISABLE" },
        { id: "c2", name: "Campaign 2", status: "DISABLE" },
      ],
      adSets: [
        { id: "s1", name: "AdSet 1", status: "DISABLE", campaignId: "c1" },
        { id: "s2", name: "AdSet 2", status: "DISABLE", campaignId: "c2" },
      ],
      ads,
    });

    expect(campaigns).toHaveLength(2);
    expect(campaigns.find((c) => c.id === "c1")?.metrics.impressions).toBe(10);
    expect(campaigns.find((c) => c.id === "c2")?.metrics).toEqual(emptyMetrics());
  });
});

describe("adsInsights nestEntityHierarchy", () => {
  it("keeps campaign/adset when ads are empty", () => {
    const campaigns = nestEntityHierarchy({
      campaigns: [{ id: "c1", name: "Camp", status: "DISABLE" }],
      adSets: [{ id: "s1", name: "Set", status: "DISABLE", campaignId: "c1" }],
      ads: [],
    });
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0].adSets).toHaveLength(1);
    expect(campaigns[0].adSets[0].ads).toHaveLength(0);
    expect(campaigns[0].metrics).toEqual(emptyMetrics());
  });
});
