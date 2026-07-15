export type AdsInsightsPlatform = "meta" | "google" | "tiktok";
export type AdsInsightsRangeDays = 7 | 14 | 30;
export type AdsInsightsView = "structure" | "keywords" | "searchTerms" | "creatives";

export type AdsInsightsMetrics = {
  impressions: number;
  clicks: number;
  spend: number;
  ctr: number;
  cpc: number;
  cpm: number | null;
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
  outboundClicks: number | null;
  videoViews: number | null;
  thruplay: number | null;
  leads: number | null;
  viewContent: number | null;
  initiateCheckout: number | null;
  allConversions: number | null;
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
  detail?: string | null;
};

export type AdsInsightsApiOk = {
  ok: true;
  platform: AdsInsightsPlatform;
  view?: AdsInsightsView;
  accountId: string;
  accountName?: string | null;
  sandbox?: boolean;
  currencyCode: string | null;
  rangeDays: AdsInsightsRangeDays;
  dateStart: string;
  dateEnd: string;
  campaigns: AdsInsightsCampaign[];
  keywords?: AdsInsightsDeepRow[];
  searchTerms?: AdsInsightsDeepRow[];
  creatives?: AdsInsightsDeepRow[];
};

export type AdsInsightsApiError = {
  ok: false;
  reason?: string;
  message?: string;
};
