import {
  classifyAdsFetchFailure,
  type AdsFetchFailureReason,
} from "../adsCatalog/adsAuthError.server";
import { fetchGoogleAdsInsights } from "./googleAdsInsights.server";
import { fetchMetaAdsInsights } from "./metaAdsInsights.server";
import {
  FETCH_RANGE_DAYS,
  isSnapshotFresh,
  loadInsightsSnapshot,
  saveInsightsSnapshot,
} from "./store.server";
import { fetchTiktokAdsInsights } from "./tiktokAdsInsights.server";
import type {
  AdsInsightsPlatform,
  AdsInsightsRangeDays,
  AdsInsightsResult,
  AdsInsightsView,
} from "./types.server";

const LOG_PREFIX = "[AdsInsights]";

async function fetchFromPlatform(params: {
  shop: string;
  platform: AdsInsightsPlatform;
  rangeDays: AdsInsightsRangeDays;
  view: AdsInsightsView;
}): Promise<AdsInsightsResult | null> {
  const { shop, rangeDays, view } = params;

  if (params.platform === "meta") {
    const result = await fetchMetaAdsInsights(shop, rangeDays, {
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
    const result = await fetchGoogleAdsInsights(shop, rangeDays, {
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
    const result = await fetchTiktokAdsInsights(shop, rangeDays, {
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

/**
 * 回源拉取并落库。
 *
 * 固定按 30 天窗口拉，这样 7 / 14 天视图之后都能直接从库里切。
 */
async function refreshAndSave(params: {
  shop: string;
  platform: AdsInsightsPlatform;
  rangeDays: AdsInsightsRangeDays;
}): Promise<AdsInsightsResult | null> {
  const result = await fetchFromPlatform({
    shop: params.shop,
    platform: params.platform,
    rangeDays: FETCH_RANGE_DAYS,
    view: "structure",
  });
  if (!result) return null;

  try {
    await saveInsightsSnapshot({ shop: params.shop, result });
  } catch (e) {
    // 落库失败不该让页面空着：本次仍然返回刚拉到的数据。
    console.error(
      `${LOG_PREFIX} save failed shop=${params.shop} platform=${params.platform} ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (params.rangeDays === FETCH_RANGE_DAYS) {
    return stripInternal(result);
  }

  // 请求的是更短区间：拉的是 30 天，改从库里切出对应窗口。
  const snapshot = await loadInsightsSnapshot({
    shop: params.shop,
    platform: params.platform,
    rangeDays: params.rangeDays,
  });
  return snapshot ? snapshot.result : stripInternal(result);
}

/** `daily` 只用于落库，不进 HTTP 响应。 */
function stripInternal(result: AdsInsightsResult): AdsInsightsResult {
  return { ...result, daily: undefined };
}

/** 回源失败但仍有数据可展示时的降级说明。 */
export type AdsInsightsDegraded = {
  reason: AdsFetchFailureReason;
  message: string;
};

export type AdsInsightsOutcome = {
  result: AdsInsightsResult | null;
  /**
   * 非 null 表示这次返回的是过期快照兜底的数据。
   * 不把它带出去的话，授权失效后页面会一直安静地显示旧数字，商户无从察觉。
   */
  degraded: AdsInsightsDegraded | null;
};

export async function fetchAdsInsights(params: {
  shop: string;
  platform: AdsInsightsPlatform;
  rangeDays: AdsInsightsRangeDays;
  view?: AdsInsightsView;
  /** 跳过快照直接回源。 */
  forceRefresh?: boolean;
}): Promise<AdsInsightsOutcome> {
  const view = params.view ?? "structure";

  // 关键词 / 搜索词 / 素材是平台特有的深层级明细，不落库，仍然实时拉。
  if (view !== "structure") {
    const result = await fetchFromPlatform({
      shop: params.shop,
      platform: params.platform,
      rangeDays: params.rangeDays,
      view,
    });
    return { result: result ? stripInternal(result) : null, degraded: null };
  }

  if (!params.forceRefresh) {
    const snapshot = await loadInsightsSnapshot({
      shop: params.shop,
      platform: params.platform,
      rangeDays: params.rangeDays,
    });
    if (snapshot && isSnapshotFresh(snapshot.fetchedAt)) {
      return { result: snapshot.result, degraded: null };
    }

    try {
      const result = await refreshAndSave({
        shop: params.shop,
        platform: params.platform,
        rangeDays: params.rangeDays,
      });
      return { result, degraded: null };
    } catch (e) {
      // 回源失败时用过期快照兜底，比整页报错好；但要把降级原因一起交出去。
      if (snapshot) {
        const message = e instanceof Error ? e.message : String(e);
        const reason = classifyAdsFetchFailure(params.platform, e);
        console.warn(
          `${LOG_PREFIX} refresh failed, serving stale snapshot shop=${params.shop} platform=${params.platform} reason=${reason} ${message}`,
        );
        return { result: snapshot.result, degraded: { reason, message } };
      }
      throw e;
    }
  }

  const result = await refreshAndSave({
    shop: params.shop,
    platform: params.platform,
    rangeDays: params.rangeDays,
  });
  return { result, degraded: null };
}

export type {
  AdsInsightsPlatform,
  AdsInsightsRangeDays,
  AdsInsightsResult,
  AdsInsightsView,
} from "./types.server";
