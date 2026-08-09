import { fetchGoogleAdsInsights } from "./googleAdsInsights.server";
import { fetchGoogleAdsSandboxInsights } from "./googleSandbox.server";
import { fetchMetaAdsInsights } from "./metaAdsInsights.server";
import { fetchMetaSandboxInsights } from "./metaSandbox.server";
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
  sandbox: boolean;
}): Promise<AdsInsightsResult | null> {
  const { shop, rangeDays, view, sandbox } = params;

  if (params.platform === "meta") {
    const result = sandbox
      ? await fetchMetaSandboxInsights(rangeDays, {
          includeCreatives: view === "creatives",
        })
      : await fetchMetaAdsInsights(shop, rangeDays, {
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
    const fetcher = sandbox ? fetchGoogleAdsSandboxInsights : fetchGoogleAdsInsights;
    const result = await fetcher(shop, rangeDays, {
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
      sandbox,
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
    sandbox: false,
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

export async function fetchAdsInsights(params: {
  shop: string;
  platform: AdsInsightsPlatform;
  rangeDays: AdsInsightsRangeDays;
  view?: AdsInsightsView;
  /** Meta / TikTok / Google：沙盒或测试账号模式，与正式 Catalog OAuth 隔离 */
  sandbox?: boolean;
  /** 跳过快照直接回源。 */
  forceRefresh?: boolean;
}): Promise<AdsInsightsResult | null> {
  const view = params.view ?? "structure";
  const sandbox = Boolean(params.sandbox);

  // 关键词 / 搜索词 / 素材是平台特有的深层级明细，不落库，仍然实时拉。
  // 沙盒是模拟数据，也不进库。
  if (view !== "structure" || sandbox) {
    const result = await fetchFromPlatform({
      shop: params.shop,
      platform: params.platform,
      rangeDays: params.rangeDays,
      view,
      sandbox,
    });
    return result ? stripInternal(result) : null;
  }

  if (!params.forceRefresh) {
    const snapshot = await loadInsightsSnapshot({
      shop: params.shop,
      platform: params.platform,
      rangeDays: params.rangeDays,
    });
    if (snapshot && isSnapshotFresh(snapshot.fetchedAt)) {
      return snapshot.result;
    }

    try {
      return await refreshAndSave({
        shop: params.shop,
        platform: params.platform,
        rangeDays: params.rangeDays,
      });
    } catch (e) {
      // 回源失败时用过期快照兜底，比整页报错好。
      if (snapshot) {
        console.warn(
          `${LOG_PREFIX} refresh failed, serving stale snapshot shop=${params.shop} platform=${params.platform} ${e instanceof Error ? e.message : String(e)}`,
        );
        return snapshot.result;
      }
      throw e;
    }
  }

  return refreshAndSave({
    shop: params.shop,
    platform: params.platform,
    rangeDays: params.rangeDays,
  });
}

export type {
  AdsInsightsPlatform,
  AdsInsightsRangeDays,
  AdsInsightsResult,
  AdsInsightsView,
} from "./types.server";
