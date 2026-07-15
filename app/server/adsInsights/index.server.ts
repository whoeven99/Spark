import { fetchGoogleAdsInsights } from "./googleAdsInsights.server";
import { fetchMetaAdsInsights } from "./metaAdsInsights.server";
import { fetchTiktokAdsInsights } from "./tiktokAdsInsights.server";
import type {
  AdsInsightsPlatform,
  AdsInsightsRangeDays,
  AdsInsightsResult,
  AdsInsightsView,
} from "./types.server";

export async function fetchAdsInsights(params: {
  shop: string;
  platform: AdsInsightsPlatform;
  rangeDays: AdsInsightsRangeDays;
  view?: AdsInsightsView;
}): Promise<AdsInsightsResult | null> {
  const view = params.view ?? "structure";

  if (params.platform === "meta") {
    const result = await fetchMetaAdsInsights(params.shop, params.rangeDays, {
      includeCreatives: view === "creatives",
    });
    if (!result) return null;
    if (view === "structure") {
      return { ...result, keywords: undefined, searchTerms: undefined, creatives: undefined };
    }
    if (view === "creatives") {
      return {
        ...result,
        campaigns: [],
        keywords: [],
        searchTerms: [],
        creatives: result.creatives ?? [],
      };
    }
    return { ...result, campaigns: [], keywords: [], searchTerms: [], creatives: [] };
  }

  if (params.platform === "google") {
    const result = await fetchGoogleAdsInsights(params.shop, params.rangeDays, {
      includeStructure: view === "structure",
      includeKeywords: view === "keywords",
      includeSearchTerms: view === "searchTerms",
      includeCreatives: view === "creatives",
    });
    if (!result) return null;
    if (view === "structure") {
      return { ...result, keywords: undefined, searchTerms: undefined, creatives: undefined };
    }
    if (view === "keywords") {
      return {
        ...result,
        campaigns: [],
        searchTerms: [],
        creatives: [],
        keywords: result.keywords ?? [],
      };
    }
    if (view === "searchTerms") {
      return {
        ...result,
        campaigns: [],
        keywords: [],
        creatives: [],
        searchTerms: result.searchTerms ?? [],
      };
    }
    return {
      ...result,
      campaigns: [],
      keywords: [],
      searchTerms: [],
      creatives: result.creatives ?? [],
    };
  }

  if (params.platform === "tiktok") {
    const result = await fetchTiktokAdsInsights(params.shop, params.rangeDays, {
      includeCreatives: view === "creatives",
    });
    if (!result) return null;
    if (view === "structure") {
      return { ...result, keywords: undefined, searchTerms: undefined, creatives: undefined };
    }
    if (view === "creatives") {
      return {
        ...result,
        campaigns: [],
        keywords: [],
        searchTerms: [],
        creatives: result.creatives ?? [],
      };
    }
    return { ...result, campaigns: [], keywords: [], searchTerms: [], creatives: [] };
  }

  return null;
}

export type {
  AdsInsightsPlatform,
  AdsInsightsRangeDays,
  AdsInsightsResult,
  AdsInsightsView,
} from "./types.server";
