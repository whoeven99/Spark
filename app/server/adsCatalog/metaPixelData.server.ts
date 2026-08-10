/**
 * Meta Pixel 数据页：从 Meta Graph API 拉取 Pixel 元数据与 stats（近 7 天窗口）。
 */

import {
  getMetaAdsPixelMetadata,
  getMetaAdsPixelStats,
  type MetaAdsPixelMetadata,
  type MetaAdsPixelStatsRow,
} from "./clients/facebookGraphClient.server";
import {
  getFacebookCatalogCredential,
  getMetaAdsCredential,
  type FacebookCatalogCredential,
} from "./credentialStore.server";

const LOG_PREFIX = "[AdsCatalog][MetaPixelData]";
const WINDOW_DAYS = 7;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

export type MetaPixelStatsTokenSource = "meta_ads_oauth" | "catalog_oauth";

export type MetaPixelHourlyFire = {
  hour: string;
  count: number;
};

export type MetaPixelDataStats = {
  configured: boolean;
  pixelId: string;
  tokenSource: MetaPixelStatsTokenSource | null;
  needsMetaAdsConnect: boolean;
  permissionError: string | null;
  windowDays: number;
  from: number;
  to: number;
  metadata: MetaAdsPixelMetadata | null;
  eventTotals: MetaAdsPixelStatsRow[];
  eventTotalsWeb: MetaAdsPixelStatsRow[];
  eventTotalsServer: MetaAdsPixelStatsRow[];
  hourlyFires: MetaPixelHourlyFire[];
};

function normalizeShop(shop: string): string {
  return shop.trim().toLowerCase();
}

/** Stats 读取 token：优先 Meta Ads OAuth，再 Catalog OAuth。 */
export async function resolveMetaPixelStatsAccessToken(params: {
  shop: string;
  catalog?: FacebookCatalogCredential | null;
}): Promise<{ token: string; source: MetaPixelStatsTokenSource } | null> {
  const shop = normalizeShop(params.shop);
  const metaAds = await getMetaAdsCredential(shop);
  const metaAdsToken = metaAds?.accessToken?.trim();
  if (metaAdsToken) {
    return { token: metaAdsToken, source: "meta_ads_oauth" };
  }

  const catalog =
    params.catalog ?? (await getFacebookCatalogCredential(shop));
  const catalogToken = catalog?.accessToken?.trim();
  if (catalogToken) {
    return { token: catalogToken, source: "catalog_oauth" };
  }

  return null;
}

function flattenEventTotalCounts(
  buckets: Awaited<ReturnType<typeof getMetaAdsPixelStats>>,
): MetaAdsPixelStatsRow[] {
  const merged = new Map<string, number>();
  for (const bucket of buckets) {
    for (const row of bucket.rows) {
      merged.set(row.value, (merged.get(row.value) ?? 0) + row.count);
    }
  }
  return [...merged.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

function flattenHourlyFires(
  buckets: Awaited<ReturnType<typeof getMetaAdsPixelStats>>,
): MetaPixelHourlyFire[] {
  return buckets
    .map((bucket) => ({
      hour: bucket.startTime,
      count: bucket.count ?? bucket.rows.reduce((sum, row) => sum + row.count, 0),
    }))
    .filter((row) => row.hour)
    .sort((a, b) => a.hour.localeCompare(b.hour));
}

function isPermissionError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("permission") ||
    lower.includes("oauth") ||
    lower.includes("access token") ||
    lower.includes("ads_read") ||
    lower.includes("(#200)") ||
    lower.includes("(#10)")
  );
}

export async function loadMetaPixelDataStats(params: {
  shop: string;
}): Promise<MetaPixelDataStats> {
  const shop = normalizeShop(params.shop);
  const catalog = await getFacebookCatalogCredential(shop);
  const pixelId = catalog?.pixelId?.trim() ?? "";
  const to = Date.now();
  const from = to - WINDOW_MS;

  const empty: MetaPixelDataStats = {
    configured: Boolean(pixelId),
    pixelId,
    tokenSource: null,
    needsMetaAdsConnect: false,
    permissionError: null,
    windowDays: WINDOW_DAYS,
    from,
    to,
    metadata: null,
    eventTotals: [],
    eventTotalsWeb: [],
    eventTotalsServer: [],
    hourlyFires: [],
  };

  if (!pixelId) return empty;

  const resolved = await resolveMetaPixelStatsAccessToken({ shop, catalog });
  if (!resolved) {
    return {
      ...empty,
      permissionError: "no_token",
    };
  }

  const { token, source } = resolved;
  const apiVersion = catalog?.apiVersion;

  try {
    const [metadata, totalBuckets, webBuckets, serverBuckets, hourlyBuckets] =
      await Promise.all([
        getMetaAdsPixelMetadata({ accessToken: token, pixelId, apiVersion }),
        getMetaAdsPixelStats({
          accessToken: token,
          pixelId,
          aggregation: "event_total_counts",
          startTime: from,
          endTime: to,
          apiVersion,
        }),
        getMetaAdsPixelStats({
          accessToken: token,
          pixelId,
          aggregation: "event_total_counts",
          startTime: from,
          endTime: to,
          eventSource: "WEB_ONLY",
          apiVersion,
        }),
        getMetaAdsPixelStats({
          accessToken: token,
          pixelId,
          aggregation: "event_total_counts",
          startTime: from,
          endTime: to,
          eventSource: "SERVER_ONLY",
          apiVersion,
        }),
        getMetaAdsPixelStats({
          accessToken: token,
          pixelId,
          aggregation: "pixel_fire",
          startTime: from,
          endTime: to,
          apiVersion,
        }),
      ]);

    return {
      configured: true,
      pixelId,
      tokenSource: source,
      needsMetaAdsConnect: false,
      permissionError: null,
      windowDays: WINDOW_DAYS,
      from,
      to,
      metadata,
      eventTotals: flattenEventTotalCounts(totalBuckets),
      eventTotalsWeb: flattenEventTotalCounts(webBuckets),
      eventTotalsServer: flattenEventTotalCounts(serverBuckets),
      hourlyFires: flattenHourlyFires(hourlyBuckets),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn(`${LOG_PREFIX} stats_failed shop=${shop} pixel=${pixelId} err=${message}`);
    const needsMetaAdsConnect =
      source === "catalog_oauth" && isPermissionError(message);
    return {
      ...empty,
      tokenSource: source,
      needsMetaAdsConnect,
      permissionError: message,
    };
  }
}
