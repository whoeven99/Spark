import { fetchGoogleAdsInsights } from "./googleAdsInsights.server";
import { fetchMetaAdsInsights } from "./metaAdsInsights.server";
import { fetchTiktokAdsInsights } from "./tiktokAdsInsights.server";
import type {
  AdsInsightsPlatform,
  AdsInsightsRangeDays,
  AdsInsightsResult,
} from "./types.server";

export async function fetchAdsInsights(params: {
  shop: string;
  platform: AdsInsightsPlatform;
  rangeDays: AdsInsightsRangeDays;
}): Promise<AdsInsightsResult | null> {
  switch (params.platform) {
    case "meta":
      return fetchMetaAdsInsights(params.shop, params.rangeDays);
    case "google":
      return fetchGoogleAdsInsights(params.shop, params.rangeDays);
    case "tiktok":
      return fetchTiktokAdsInsights(params.shop, params.rangeDays);
    default:
      return null;
  }
}

export type {
  AdsInsightsPlatform,
  AdsInsightsRangeDays,
  AdsInsightsResult,
} from "./types.server";
