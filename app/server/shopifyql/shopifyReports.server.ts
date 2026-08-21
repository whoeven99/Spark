import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import {
  emptyReportsPage,
  type RangeKey,
  type ReportTab,
  type ShopifyReportsPageData,
} from "../../lib/shopifyReports";
import { fetchReportPageFromShopify } from "./reportFetch.server";
import {
  acquireReportShopLock,
  enqueueShopifyReportRefresh,
  persistReportPage,
  releaseReportShopLock,
} from "./reportRefresh.server";
import {
  loadReportSnapshot,
  readReportPageCache,
  writeReportPageCache,
} from "./reportSnapshot.server";

export type ShopifyReportsRuntime = {
  now?: () => Date;
  readCache?: typeof readReportPageCache;
  writeCache?: typeof writeReportPageCache;
  loadSnapshot?: typeof loadReportSnapshot;
  persistPage?: typeof persistReportPage;
  acquireLock?: typeof acquireReportShopLock;
  releaseLock?: typeof releaseReportShopLock;
  enqueueRefresh?: typeof enqueueShopifyReportRefresh;
  fetchPage?: typeof fetchReportPageFromShopify;
};

function resolveRuntime(runtime?: ShopifyReportsRuntime) {
  return {
    now: runtime?.now ?? (() => new Date()),
    readCache: runtime?.readCache ?? readReportPageCache,
    writeCache: runtime?.writeCache ?? writeReportPageCache,
    loadSnapshot: runtime?.loadSnapshot ?? loadReportSnapshot,
    persistPage: runtime?.persistPage ?? persistReportPage,
    acquireLock: runtime?.acquireLock ?? acquireReportShopLock,
    releaseLock: runtime?.releaseLock ?? releaseReportShopLock,
    enqueueRefresh: runtime?.enqueueRefresh ?? enqueueShopifyReportRefresh,
    fetchPage: runtime?.fetchPage ?? fetchReportPageFromShopify,
  };
}

function withRefreshing(page: ShopifyReportsPageData, refreshing: boolean): ShopifyReportsPageData {
  return {
    ...page,
    refreshing,
    freshness: refreshing && page.freshness === "fresh" ? "stale" : page.freshness,
  };
}

async function serveSnapshot(params: {
  shop: string;
  tab: ReportTab;
  range: RangeKey;
  snapshot: ShopifyReportsPageData;
  forceRefresh: boolean;
  runtime: ReturnType<typeof resolveRuntime>;
}): Promise<ShopifyReportsPageData> {
  const stale = params.forceRefresh || params.snapshot.freshness === "stale";
  if (stale) {
    params.runtime.enqueueRefresh({
      shop: params.shop,
      tab: params.tab,
      range: params.range,
    });
  }
  const page = withRefreshing(params.snapshot, stale);
  await params.runtime.writeCache(params.shop, params.tab, params.range, page);
  return page;
}

export async function loadShopifyReports(options: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  tab: ReportTab;
  range: RangeKey;
  hasReadReports: boolean;
  forceRefresh?: boolean;
  runtime?: ShopifyReportsRuntime;
}): Promise<ShopifyReportsPageData> {
  const { admin, shop, tab, range, hasReadReports, forceRefresh = false } = options;
  const runtime = resolveRuntime(options.runtime);
  const now = runtime.now();
  if (!hasReadReports) {
    return emptyReportsPage(tab, range, "missing_scope");
  }

  if (!forceRefresh) {
    const cached = await runtime.readCache(shop, tab, range);
    if (cached) {
      if (cached.freshness === "stale") {
        runtime.enqueueRefresh({ shop, tab, range });
      }
      return cached;
    }
  }

  const snapshot = await runtime.loadSnapshot({ shop, tab, range, now });
  if (snapshot) {
    return serveSnapshot({ shop, tab, range, snapshot, forceRefresh, runtime });
  }

  const acquired = await runtime.acquireLock({ shop, tab, range, now });
  if (!acquired) {
    return emptyReportsPage(tab, range, "ok", { freshness: "loading", refreshing: true });
  }

  try {
    const page = await runtime.fetchPage({ admin, tab, range, now });
    await runtime.persistPage({ shop, page });
    return page;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ShopifyReports] cold fetch failed shop=${shop} tab=${tab} ${message}`);
    return emptyReportsPage(tab, range, "ok", { freshness: "loading", refreshing: false });
  } finally {
    await runtime.releaseLock(shop);
  }
}
