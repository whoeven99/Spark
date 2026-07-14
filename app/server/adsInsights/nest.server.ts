import {
  type AdsInsightsAd,
  type AdsInsightsAdSet,
  type AdsInsightsCampaign,
  type AdsInsightsMetrics,
  emptyMetrics,
  finalizeMetrics,
} from "./types.server";

type FlatAdRow = {
  campaignId: string;
  campaignName: string;
  campaignStatus: string;
  adSetId: string;
  adSetName: string;
  adSetStatus: string;
  adId: string;
  adName: string;
  adStatus: string;
  metrics: AdsInsightsMetrics;
};

function sumNullable(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

function weightedFrequency(
  reachA: number | null,
  freqA: number | null,
  reachB: number | null,
  freqB: number | null,
): number | null {
  const rA = reachA ?? 0;
  const rB = reachB ?? 0;
  if (rA + rB <= 0) return null;
  if (freqA === null && freqB === null) return null;
  return ((freqA ?? 0) * rA + (freqB ?? 0) * rB) / (rA + rB);
}

export function mergeMetrics(
  a: AdsInsightsMetrics,
  b: AdsInsightsMetrics,
): AdsInsightsMetrics {
  const impressions = a.impressions + b.impressions;
  const clicks = a.clicks + b.clicks;
  const spend = a.spend + b.spend;
  const conversions = a.conversions + b.conversions;
  const conversionsValue = a.conversionsValue + b.conversionsValue;
  const reach = sumNullable(a.reach, b.reach);
  const frequency = weightedFrequency(a.reach, a.frequency, b.reach, b.frequency);

  return finalizeMetrics({
    impressions,
    clicks,
    spend,
    conversions,
    conversionsValue,
    purchases: sumNullable(a.purchases, b.purchases),
    purchaseValue: sumNullable(a.purchaseValue, b.purchaseValue),
    addToCart: sumNullable(a.addToCart, b.addToCart),
    landingPageViews: sumNullable(a.landingPageViews, b.landingPageViews),
    reach,
    frequency,
  });
}

/** 将扁平 Ad 行聚合成 Campaign → AdSet → Ad 树。 */
export function nestFlatAdRows(rows: FlatAdRow[]): AdsInsightsCampaign[] {
  type AdSetBucket = {
    id: string;
    name: string;
    status: string;
    metrics: AdsInsightsMetrics;
    ads: Map<string, AdsInsightsAd>;
  };
  type CampaignBucket = {
    id: string;
    name: string;
    status: string;
    metrics: AdsInsightsMetrics;
    adSets: Map<string, AdSetBucket>;
  };

  const campaigns = new Map<string, CampaignBucket>();

  for (const row of rows) {
    if (!row.campaignId || !row.adSetId || !row.adId) continue;

    let campaign = campaigns.get(row.campaignId);
    if (!campaign) {
      campaign = {
        id: row.campaignId,
        name: row.campaignName || row.campaignId,
        status: row.campaignStatus || "UNKNOWN",
        metrics: emptyMetrics(),
        adSets: new Map(),
      };
      campaigns.set(row.campaignId, campaign);
    }

    let adSet = campaign.adSets.get(row.adSetId);
    if (!adSet) {
      adSet = {
        id: row.adSetId,
        name: row.adSetName || row.adSetId,
        status: row.adSetStatus || "UNKNOWN",
        metrics: emptyMetrics(),
        ads: new Map(),
      };
      campaign.adSets.set(row.adSetId, adSet);
    }

    const existingAd = adSet.ads.get(row.adId);
    if (existingAd) {
      existingAd.metrics = mergeMetrics(existingAd.metrics, row.metrics);
    } else {
      adSet.ads.set(row.adId, {
        id: row.adId,
        name: row.adName || row.adId,
        status: row.adStatus || "UNKNOWN",
        metrics: row.metrics,
      });
    }
  }

  // 自底向上汇总 metrics
  const result: AdsInsightsCampaign[] = [];
  for (const campaign of campaigns.values()) {
    const adSets: AdsInsightsAdSet[] = [];
    let campaignMetrics = emptyMetrics();

    for (const adSet of campaign.adSets.values()) {
      const ads = [...adSet.ads.values()].sort(
        (a, b) => b.metrics.spend - a.metrics.spend,
      );
      let adSetMetrics = emptyMetrics();
      for (const ad of ads) {
        adSetMetrics = mergeMetrics(adSetMetrics, ad.metrics);
      }
      adSets.push({
        id: adSet.id,
        name: adSet.name,
        status: adSet.status,
        metrics: adSetMetrics,
        ads,
      });
      campaignMetrics = mergeMetrics(campaignMetrics, adSetMetrics);
    }

    adSets.sort((a, b) => b.metrics.spend - a.metrics.spend);
    result.push({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      metrics: campaignMetrics,
      adSets,
    });
  }

  result.sort((a, b) => b.metrics.spend - a.metrics.spend);
  return result;
}
