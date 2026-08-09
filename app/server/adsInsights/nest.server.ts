import {
  type AdsInsightsAd,
  type AdsInsightsAdSet,
  type AdsInsightsCampaign,
  type AdsInsightsDailyRow,
  type AdsInsightsMetrics,
  emptyMetrics,
  finalizeMetrics,
} from "./types.server";

export type FlatAdRow = {
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

/** 平台按天拉取时的扁平行。 */
export type FlatAdDailyRow = FlatAdRow & {
  /** UTC 日历日，YYYY-MM-DD */
  date: string;
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
    outboundClicks: sumNullable(a.outboundClicks, b.outboundClicks),
    videoViews: sumNullable(a.videoViews, b.videoViews),
    thruplay: sumNullable(a.thruplay, b.thruplay),
    leads: sumNullable(a.leads, b.leads),
    viewContent: sumNullable(a.viewContent, b.viewContent),
    initiateCheckout: sumNullable(a.initiateCheckout, b.initiateCheckout),
    allConversions: sumNullable(a.allConversions, b.allConversions),
  });
}

/**
 * 把按天拉取的行折叠成每广告一行，供既有嵌套逻辑消费。
 *
 * reach / frequency 是去重指标，日粒度相加会虚高，折叠后一律清空，
 * 与落库口径保持一致（详见 `AdMetricDaily`）。
 */
export function collapseDailyRows(rows: FlatAdDailyRow[]): FlatAdRow[] {
  const byAdId = new Map<string, FlatAdRow>();
  for (const row of rows) {
    const existing = byAdId.get(row.adId);
    if (existing) {
      existing.metrics = mergeMetrics(existing.metrics, row.metrics);
      continue;
    }
    byAdId.set(row.adId, {
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      campaignStatus: row.campaignStatus,
      adSetId: row.adSetId,
      adSetName: row.adSetName,
      adSetStatus: row.adSetStatus,
      adId: row.adId,
      adName: row.adName,
      adStatus: row.adStatus,
      metrics: row.metrics,
    });
  }
  for (const row of byAdId.values()) {
    row.metrics = { ...row.metrics, reach: null, frequency: null };
  }
  return [...byAdId.values()];
}

/** 扁平按天行 → 落库用的日指标行；同一广告同一天的多行先合并。 */
export function toDailyRows(rows: FlatAdDailyRow[]): AdsInsightsDailyRow[] {
  const byAdDate = new Map<string, AdsInsightsDailyRow>();
  for (const row of rows) {
    if (!row.adId || !row.date) continue;
    const key = `${row.adId}|${row.date}`;
    const existing = byAdDate.get(key);
    if (existing) {
      existing.metrics = mergeMetrics(existing.metrics, row.metrics);
      continue;
    }
    byAdDate.set(key, {
      adId: row.adId,
      campaignId: row.campaignId,
      adSetId: row.adSetId,
      date: row.date,
      metrics: row.metrics,
    });
  }
  return [...byAdDate.values()];
}

/**
 * 用报表扁平行给实体广告补齐指标；无报表数据的广告保留空指标。
 * 报表中存在但实体列表缺失的广告（如已删除）仍会保留。
 */
export function mergeEntityAdsWithFlatMetrics(
  ads: EntityAd[],
  flat: FlatAdRow[],
): EntityAd[] {
  const metricsByAdId = new Map(flat.map((row) => [row.adId, row.metrics]));
  const seen = new Set<string>();

  const merged = ads.map((ad) => {
    seen.add(ad.id);
    return {
      ...ad,
      metrics: metricsByAdId.get(ad.id) ?? ad.metrics ?? emptyMetrics(),
    };
  });

  for (const row of flat) {
    if (seen.has(row.adId)) continue;
    merged.push({
      id: row.adId,
      name: row.adName,
      status: row.adStatus,
      campaignId: row.campaignId,
      adSetId: row.adSetId,
      metrics: row.metrics,
    });
  }

  return merged;
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

type EntityCampaign = { id: string; name: string; status: string };
type EntityAdSet = { id: string; name: string; status: string; campaignId: string };
export type EntityAd = {
  id: string;
  name: string;
  status: string;
  campaignId: string;
  adSetId: string;
  metrics?: AdsInsightsMetrics;
};

/**
 * 从实体列表构建树（沙盒报告为空时仍展示系列/组/广告）。
 * 无广告时保留广告组（ads=[]）；无广告组时保留空系列。
 */
export function nestEntityHierarchy(params: {
  campaigns: EntityCampaign[];
  adSets: EntityAdSet[];
  ads: EntityAd[];
}): AdsInsightsCampaign[] {
  type AdSetBucket = {
    id: string;
    name: string;
    status: string;
    ads: Map<string, AdsInsightsAd>;
  };
  type CampaignBucket = {
    id: string;
    name: string;
    status: string;
    adSets: Map<string, AdSetBucket>;
  };

  const campaigns = new Map<string, CampaignBucket>();

  for (const c of params.campaigns) {
    if (!c.id) continue;
    campaigns.set(c.id, {
      id: c.id,
      name: c.name || c.id,
      status: c.status || "UNKNOWN",
      adSets: new Map(),
    });
  }

  for (const s of params.adSets) {
    if (!s.id || !s.campaignId) continue;
    let campaign = campaigns.get(s.campaignId);
    if (!campaign) {
      campaign = {
        id: s.campaignId,
        name: s.campaignId,
        status: "UNKNOWN",
        adSets: new Map(),
      };
      campaigns.set(s.campaignId, campaign);
    }
    campaign.adSets.set(s.id, {
      id: s.id,
      name: s.name || s.id,
      status: s.status || "UNKNOWN",
      ads: new Map(),
    });
  }

  for (const a of params.ads) {
    if (!a.id || !a.campaignId || !a.adSetId) continue;
    let campaign = campaigns.get(a.campaignId);
    if (!campaign) {
      campaign = {
        id: a.campaignId,
        name: a.campaignId,
        status: "UNKNOWN",
        adSets: new Map(),
      };
      campaigns.set(a.campaignId, campaign);
    }
    let adSet = campaign.adSets.get(a.adSetId);
    if (!adSet) {
      adSet = {
        id: a.adSetId,
        name: a.adSetId,
        status: "UNKNOWN",
        ads: new Map(),
      };
      campaign.adSets.set(a.adSetId, adSet);
    }
    adSet.ads.set(a.id, {
      id: a.id,
      name: a.name || a.id,
      status: a.status || "UNKNOWN",
      metrics: a.metrics ?? emptyMetrics(),
    });
  }

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
    adSets.sort((a, b) => a.name.localeCompare(b.name));
    result.push({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      metrics: campaignMetrics,
      adSets,
    });
  }

  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}
