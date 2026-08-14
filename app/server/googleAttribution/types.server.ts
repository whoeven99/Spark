import type { AdsInsightsRangeDays } from "../adsInsights/types.server";

export type AttributionMatchQuality = "linked" | "name_only" | "ads_only" | "ga4_only";

export type UnifiedCampaignRow = {
  campaignId: string | null;
  campaignName: string;
  impressions: number;
  clicks: number;
  spend: number;
  adsConversions: number;
  adsConversionValue: number;
  sessions: number;
  users: number;
  ga4Revenue: number;
  ga4Purchases: number;
  roas: number | null;
  matchQuality: AttributionMatchQuality;
};

export type UnifiedAttributionTotals = {
  impressions: number;
  clicks: number;
  spend: number;
  adsConversions: number;
  adsConversionValue: number;
  sessions: number;
  users: number;
  ga4Revenue: number;
  ga4Purchases: number;
  roas: number | null;
};

export type UnifiedAttributionResult = {
  adsConnected: boolean;
  ga4Connected: boolean;
  adsAccountId: string | null;
  ga4PropertyCount: number;
  currencyCode: string | null;
  rangeDays: AdsInsightsRangeDays;
  dateStart: string;
  dateEnd: string;
  linked: boolean;
  totals: UnifiedAttributionTotals;
  campaigns: UnifiedCampaignRow[];
  warnings: string[];
};
