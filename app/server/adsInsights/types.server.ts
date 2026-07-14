/**
 * 广告洞察统一数据模型（Meta / Google / TikTok）。
 * 缺省字段在序列化时保持 null，前端显示为 "—"。
 */

export type AdsInsightsPlatform = "meta" | "google" | "tiktok";
export type AdsInsightsRangeDays = 7 | 14 | 30;

export type AdsInsightsMetrics = {
  impressions: number;
  clicks: number;
  spend: number;
  ctr: number;
  cpc: number;
  conversions: number;
  conversionsValue: number;
  conversionRate: number;
  /** ROAS = conversionsValue / spend；无花费时为 null */
  roas: number | null;
  purchases: number | null;
  purchaseValue: number | null;
  addToCart: number | null;
  landingPageViews: number | null;
  reach: number | null;
  frequency: number | null;
};

export type AdsInsightsNode = {
  id: string;
  name: string;
  status: string;
  metrics: AdsInsightsMetrics;
};

export type AdsInsightsAd = AdsInsightsNode;

export type AdsInsightsAdSet = AdsInsightsNode & {
  ads: AdsInsightsAd[];
};

export type AdsInsightsCampaign = AdsInsightsNode & {
  adSets: AdsInsightsAdSet[];
};

export type AdsInsightsResult = {
  platform: AdsInsightsPlatform;
  accountId: string;
  currencyCode: string | null;
  rangeDays: AdsInsightsRangeDays;
  dateStart: string;
  dateEnd: string;
  campaigns: AdsInsightsCampaign[];
};

export function emptyMetrics(): AdsInsightsMetrics {
  return {
    impressions: 0,
    clicks: 0,
    spend: 0,
    ctr: 0,
    cpc: 0,
    conversions: 0,
    conversionsValue: 0,
    conversionRate: 0,
    roas: null,
    purchases: null,
    purchaseValue: null,
    addToCart: null,
    landingPageViews: null,
    reach: null,
    frequency: null,
  };
}

export function finalizeMetrics(partial: Partial<AdsInsightsMetrics> & {
  impressions?: number;
  clicks?: number;
  spend?: number;
}): AdsInsightsMetrics {
  const impressions = partial.impressions ?? 0;
  const clicks = partial.clicks ?? 0;
  const spend = partial.spend ?? 0;
  const conversions = partial.conversions ?? 0;
  const conversionsValue = partial.conversionsValue ?? 0;
  const ctr = partial.ctr ?? (impressions > 0 ? clicks / impressions : 0);
  const cpc = partial.cpc ?? (clicks > 0 ? spend / clicks : 0);
  const conversionRate =
    partial.conversionRate ?? (clicks > 0 ? conversions / clicks : 0);
  const roas =
    partial.roas !== undefined
      ? partial.roas
      : spend > 0
        ? conversionsValue / spend
        : null;

  return {
    impressions,
    clicks,
    spend,
    ctr,
    cpc,
    conversions,
    conversionsValue,
    conversionRate,
    roas,
    purchases: partial.purchases ?? null,
    purchaseValue: partial.purchaseValue ?? null,
    addToCart: partial.addToCart ?? null,
    landingPageViews: partial.landingPageViews ?? null,
    reach: partial.reach ?? null,
    frequency: partial.frequency ?? null,
  };
}

export function toNumber(v: string | number | undefined | null): number {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
