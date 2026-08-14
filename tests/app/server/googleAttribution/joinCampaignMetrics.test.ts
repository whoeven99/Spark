import { describe, expect, it } from "vitest";
import {
  isGa4CampaignNamePresent,
  normalizeCampaignName,
} from "../../../../app/server/googleAttribution/normalizeCampaignName.server";
import {
  aggregateUnifiedTotals,
  detectGa4AdsLinking,
  joinCampaignMetrics,
} from "../../../../app/server/googleAttribution/joinCampaignMetrics.server";

describe("normalizeCampaignName", () => {
  it("normalizes spacing, case and separators", () => {
    expect(normalizeCampaignName("Summer_sale")).toBe("summer-sale");
    expect(normalizeCampaignName("  summer sale ")).toBe("summer-sale");
  });
});

describe("isGa4CampaignNamePresent", () => {
  it("rejects empty and not-set values", () => {
    expect(isGa4CampaignNamePresent("")).toBe(false);
    expect(isGa4CampaignNamePresent("(not set)")).toBe(false);
    expect(isGa4CampaignNamePresent("Summer Promo")).toBe(true);
  });
});

describe("joinCampaignMetrics", () => {
  it("joins ads and ga4 campaigns by normalized name", () => {
    const rows = joinCampaignMetrics({
      linked: true,
      adsCampaigns: [
        {
          campaignId: "1",
          campaignName: "Summer_sale",
          impressions: 1000,
          clicks: 100,
          spend: 50,
          conversions: 5,
          conversionValue: 200,
        },
      ],
      ga4Campaigns: [
        {
          campaignName: "summer-sale",
          users: 80,
          sessions: 90,
          revenue: 180,
          purchases: 4,
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      campaignId: "1",
      campaignName: "Summer_sale",
      spend: 50,
      sessions: 90,
      ga4Revenue: 180,
      matchQuality: "linked",
      roas: 3.6,
    });
  });

  it("includes ga4-only campaigns", () => {
    const rows = joinCampaignMetrics({
      linked: true,
      adsCampaigns: [],
      ga4Campaigns: [
        {
          campaignName: "Organic Boost",
          users: 10,
          sessions: 12,
          revenue: 30,
          purchases: 1,
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].matchQuality).toBe("ga4_only");
  });
});

describe("detectGa4AdsLinking", () => {
  it("detects linked campaigns from ga4 rows", () => {
    expect(
      detectGa4AdsLinking([
        { campaignName: "(not set)", users: 0, sessions: 0, revenue: 0, purchases: 0 },
      ]),
    ).toBe(false);
    expect(
      detectGa4AdsLinking([
        { campaignName: "Brand Search", users: 1, sessions: 2, revenue: 0, purchases: 0 },
      ]),
    ).toBe(true);
  });
});

describe("aggregateUnifiedTotals", () => {
  it("sums campaign metrics and computes roas", () => {
    const totals = aggregateUnifiedTotals([
      {
        campaignId: "1",
        campaignName: "A",
        impressions: 100,
        clicks: 10,
        spend: 20,
        adsConversions: 2,
        adsConversionValue: 40,
        sessions: 8,
        users: 7,
        ga4Revenue: 60,
        ga4Purchases: 1,
        roas: 3,
        matchQuality: "linked",
      },
      {
        campaignId: "2",
        campaignName: "B",
        impressions: 50,
        clicks: 5,
        spend: 10,
        adsConversions: 1,
        adsConversionValue: 15,
        sessions: 4,
        users: 3,
        ga4Revenue: 20,
        ga4Purchases: 1,
        roas: 2,
        matchQuality: "linked",
      },
    ]);

    expect(totals.spend).toBe(30);
    expect(totals.ga4Revenue).toBe(80);
    expect(totals.roas).toBeCloseTo(80 / 30);
  });
});
