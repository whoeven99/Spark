import { describe, expect, it } from "vitest";
import { googleDuringClause, parseRangeDays, resolveDateWindow } from "~/server/adsInsights/dateRange.server";
import { nestEntityHierarchy, nestFlatAdRows, mergeMetrics } from "~/server/adsInsights/nest.server";
import { emptyMetrics, finalizeMetrics, parseAdsInsightsView } from "~/server/adsInsights/types.server";
import {
  getTiktokSandboxCredentials,
  isTiktokSandboxConfigured,
} from "~/server/adsInsights/tiktokSandbox.server";

describe("adsInsights dateRange", () => {
  it("parses allowed ranges and defaults to 7", () => {
    expect(parseRangeDays("14")).toBe(14);
    expect(parseRangeDays("30")).toBe(30);
    expect(parseRangeDays("9")).toBe(7);
    expect(parseRangeDays(null)).toBe(7);
  });

  it("maps Google DURING clauses", () => {
    expect(googleDuringClause(7)).toBe("LAST_7_DAYS");
    expect(googleDuringClause(14)).toBe("LAST_14_DAYS");
    expect(googleDuringClause(30)).toBe("LAST_30_DAYS");
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

describe("tiktok sandbox env", () => {
  it("reports not configured when env missing", () => {
    const prevToken = process.env.TIKTOK_SANDBOX_ACCESS_TOKEN;
    const prevAdv = process.env.TIKTOK_SANDBOX_ADVERTISER_ID;
    delete process.env.TIKTOK_SANDBOX_ACCESS_TOKEN;
    delete process.env.TIKTOK_SANDBOX_ADVERTISER_ID;
    expect(isTiktokSandboxConfigured()).toBe(false);
    expect(getTiktokSandboxCredentials()).toBeNull();
    if (prevToken !== undefined) process.env.TIKTOK_SANDBOX_ACCESS_TOKEN = prevToken;
    if (prevAdv !== undefined) process.env.TIKTOK_SANDBOX_ADVERTISER_ID = prevAdv;
  });

  it("reads sandbox credentials from env", () => {
    const prevToken = process.env.TIKTOK_SANDBOX_ACCESS_TOKEN;
    const prevAdv = process.env.TIKTOK_SANDBOX_ADVERTISER_ID;
    const prevName = process.env.TIKTOK_SANDBOX_ACCOUNT_NAME;
    process.env.TIKTOK_SANDBOX_ACCESS_TOKEN = "sandbox-token-test";
    process.env.TIKTOK_SANDBOX_ADVERTISER_ID = "123";
    process.env.TIKTOK_SANDBOX_ACCOUNT_NAME = "spark-allen";
    expect(isTiktokSandboxConfigured()).toBe(true);
    expect(getTiktokSandboxCredentials()).toEqual({
      accessToken: "sandbox-token-test",
      advertiserId: "123",
      accountName: "spark-allen",
    });
    if (prevToken === undefined) delete process.env.TIKTOK_SANDBOX_ACCESS_TOKEN;
    else process.env.TIKTOK_SANDBOX_ACCESS_TOKEN = prevToken;
    if (prevAdv === undefined) delete process.env.TIKTOK_SANDBOX_ADVERTISER_ID;
    else process.env.TIKTOK_SANDBOX_ADVERTISER_ID = prevAdv;
    if (prevName === undefined) delete process.env.TIKTOK_SANDBOX_ACCOUNT_NAME;
    else process.env.TIKTOK_SANDBOX_ACCOUNT_NAME = prevName;
  });
});
