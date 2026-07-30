import { mergeMetrics } from "./nest.server";
import {
  type AdsInsightsCampaign,
  type AdsInsightsDeepRow,
  type AdsInsightsMetrics,
  finalizeMetrics,
} from "./types.server";

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function buildGoogleSandboxMockMetrics(seed: string): AdsInsightsMetrics {
  const h = hashSeed(seed || "google-sandbox");
  const impressions = 600 + (h % 8400);
  const ctrBp = 90 + (h % 310);
  const clicks = Math.max(1, Math.round((impressions * ctrBp) / 10000));
  const cpcCents = 30 + (h % 220);
  const spend = Math.round(clicks * cpcCents) / 100;
  const conversionRateBp = 50 + (h % 150);
  const conversions = Math.max(0, Math.round((clicks * conversionRateBp) / 10000));
  const avgOrder = 22 + (h % 58);
  const conversionsValue = Math.round(conversions * avgOrder * 100) / 100;
  const purchases = conversions > 0 ? Math.max(1, Math.round(conversions * 0.65)) : 0;
  const purchaseValue = Math.round(purchases * avgOrder * 100) / 100;
  const addToCart = conversions > 0 ? conversions + (h % 4) : h % 2;
  const landingPageViews = Math.max(clicks, Math.round(clicks * 1.15));

  return finalizeMetrics({
    impressions,
    clicks,
    spend,
    conversions,
    conversionsValue,
    purchases,
    purchaseValue,
    addToCart,
    landingPageViews,
    allConversions: conversions + (h % 2),
  });
}

export function applyGoogleSandboxMockMetrics(
  campaigns: AdsInsightsCampaign[],
): AdsInsightsCampaign[] {
  return campaigns.map((campaign) => {
    let campaignMetrics = finalizeMetrics({});
    const adSets = campaign.adSets.map((adSet) => {
      if (adSet.ads.length > 0) {
        const ads = adSet.ads.map((ad) => ({
          ...ad,
          metrics: buildGoogleSandboxMockMetrics(`ad:${ad.id}`),
        }));
        let adSetMetrics = finalizeMetrics({});
        for (const ad of ads) {
          adSetMetrics = mergeMetrics(adSetMetrics, ad.metrics);
        }
        campaignMetrics = mergeMetrics(campaignMetrics, adSetMetrics);
        return { ...adSet, ads, metrics: adSetMetrics };
      }
      const adSetMetrics = buildGoogleSandboxMockMetrics(`adgroup:${adSet.id}`);
      campaignMetrics = mergeMetrics(campaignMetrics, adSetMetrics);
      return { ...adSet, metrics: adSetMetrics };
    });
    if (adSets.length === 0) {
      campaignMetrics = buildGoogleSandboxMockMetrics(`campaign:${campaign.id}`);
    }
    return { ...campaign, adSets, metrics: campaignMetrics };
  });
}

export function applyGoogleSandboxMockDeepRows(
  rows: AdsInsightsDeepRow[],
): AdsInsightsDeepRow[] {
  return rows.map((row) => ({
    ...row,
    metrics: buildGoogleSandboxMockMetrics(`deep:${row.id}`),
  }));
}
