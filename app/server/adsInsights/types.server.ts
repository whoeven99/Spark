/**
 * 广告洞察统一数据模型（Meta / Google / TikTok）。
 * 缺省字段在序列化时保持 null，前端显示为 "—"。
 */

export type AdsInsightsPlatform = "meta" | "google" | "tiktok";
export type AdsInsightsRangeDays = 7 | 14 | 30;
export type AdsInsightsView = "structure" | "keywords" | "searchTerms" | "creatives";

export type AdsInsightsMetrics = {
  impressions: number;
  clicks: number;
  spend: number;
  ctr: number;
  cpc: number;
  /** 千次展示成本；无展示时为 null */
  cpm: number | null;
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
  outboundClicks: number | null;
  videoViews: number | null;
  thruplay: number | null;
  leads: number | null;
  viewContent: number | null;
  initiateCheckout: number | null;
  allConversions: number | null;
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

/** 关键词 / 搜索词 / 素材等扁平深层级行 */
export type AdsInsightsDeepRow = {
  id: string;
  name: string;
  status: string;
  campaignId: string | null;
  campaignName: string | null;
  adSetId: string | null;
  adSetName: string | null;
  adId: string | null;
  adName: string | null;
  metrics: AdsInsightsMetrics;
  /** 平台特有附加信息（如 match type、search term 文本） */
  detail?: string | null;
};

export type AdsInsightsResult = {
  platform: AdsInsightsPlatform;
  accountId: string;
  currencyCode: string | null;
  rangeDays: AdsInsightsRangeDays;
  dateStart: string;
  dateEnd: string;
  campaigns: AdsInsightsCampaign[];
  keywords?: AdsInsightsDeepRow[];
  searchTerms?: AdsInsightsDeepRow[];
  creatives?: AdsInsightsDeepRow[];
};

export function emptyMetrics(): AdsInsightsMetrics {
  return {
    impressions: 0,
    clicks: 0,
    spend: 0,
    ctr: 0,
    cpc: 0,
    cpm: null,
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
    outboundClicks: null,
    videoViews: null,
    thruplay: null,
    leads: null,
    viewContent: null,
    initiateCheckout: null,
    allConversions: null,
  };
}

export function finalizeMetrics(
  partial: Partial<AdsInsightsMetrics> & {
    impressions?: number;
    clicks?: number;
    spend?: number;
  },
): AdsInsightsMetrics {
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
  const cpm =
    partial.cpm !== undefined
      ? partial.cpm
      : impressions > 0
        ? (spend / impressions) * 1000
        : null;

  return {
    impressions,
    clicks,
    spend,
    ctr,
    cpc,
    cpm,
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
    outboundClicks: partial.outboundClicks ?? null,
    videoViews: partial.videoViews ?? null,
    thruplay: partial.thruplay ?? null,
    leads: partial.leads ?? null,
    viewContent: partial.viewContent ?? null,
    initiateCheckout: partial.initiateCheckout ?? null,
    allConversions: partial.allConversions ?? null,
  };
}

export function toNumber(v: string | number | undefined | null): number {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function parseAdsInsightsView(raw: string | null): AdsInsightsView {
  if (
    raw === "keywords" ||
    raw === "searchTerms" ||
    raw === "creatives" ||
    raw === "structure"
  ) {
    return raw;
  }
  return "structure";
}
