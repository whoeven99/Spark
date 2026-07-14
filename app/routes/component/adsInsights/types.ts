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
  roas: number | null;
  purchases: number | null;
  purchaseValue: number | null;
  addToCart: number | null;
  landingPageViews: number | null;
  reach: number | null;
  frequency: number | null;
};

export type AdsInsightsAd = {
  id: string;
  name: string;
  status: string;
  metrics: AdsInsightsMetrics;
};

export type AdsInsightsAdSet = AdsInsightsAd & {
  ads: AdsInsightsAd[];
};

export type AdsInsightsCampaign = AdsInsightsAd & {
  adSets: AdsInsightsAdSet[];
};

export type AdsInsightsApiOk = {
  ok: true;
  platform: AdsInsightsPlatform;
  accountId: string;
  currencyCode: string | null;
  rangeDays: AdsInsightsRangeDays;
  dateStart: string;
  dateEnd: string;
  campaigns: AdsInsightsCampaign[];
};

export type AdsInsightsApiError = {
  ok: false;
  reason?: string;
  message?: string;
};
