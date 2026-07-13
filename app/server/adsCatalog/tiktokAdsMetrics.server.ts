/**
 * TikTok Ads 广告系列指标查询（最近 7 天）。
 *
 * 1. campaign/get：拿广告系列名称与状态
 * 2. report/integrated/get：拿 spend / impressions / clicks / conversions 等
 */

import {
  getTiktokCatalogCredential,
  setTiktokCatalogCredential,
} from "./credentialStore.server";
import {
  TIKTOK_API_BASE,
  TIKTOK_REFRESH_TOKEN_URL,
  getTiktokAppCredentials,
} from "./tiktokOAuth.server";
import {
  formatOutboundErrorLog,
  formatOutboundNetworkError,
} from "../common/outboundError.server";

const LOG_PREFIX = "[AdsCatalog][TiktokAdsMetrics]";

export interface TiktokAdsCampaignMetrics {
  campaignId: string;
  campaignName: string;
  campaignStatus: string;
  impressions: number;
  clicks: number;
  costAmount: number;
  ctr: number;
  averageCpc: number;
  conversions: number;
  conversionsValue: number;
  conversionRate: number;
}

export interface TiktokAdsMetricsResult {
  advertiserId: string;
  dateRange: "LAST_7_DAYS";
  campaigns: TiktokAdsCampaignMetrics[];
  currencyCode: string | null;
}

function toNumber(v: string | number | undefined | null): number {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function last7DaysRange(now = new Date()): { startDate: string; endDate: string } {
  const end = new Date(now);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 6);
  return { startDate: formatDate(start), endDate: formatDate(end) };
}

async function refreshTiktokAccessToken(params: {
  shop: string;
  refreshToken: string;
  advertiserId: string;
  catalogId: string;
  catalogName?: string;
}): Promise<string | null> {
  const { appId, appSecret } = getTiktokAppCredentials();
  if (!appId || !appSecret) return null;

  const response = await fetch(TIKTOK_REFRESH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: appId,
      secret: appSecret,
      refresh_token: params.refreshToken,
    }),
  });
  const json = (await response.json().catch(() => ({}))) as {
    code?: number;
    message?: string;
    data?: { access_token?: string; refresh_token?: string };
  };
  if (!response.ok || json.code !== 0 || !json.data?.access_token) {
    console.error(
      `${LOG_PREFIX} refresh failed shop=${params.shop} ${json.message || `HTTP ${response.status}`}`,
    );
    return null;
  }

  await setTiktokCatalogCredential(params.shop, {
    accessToken: json.data.access_token,
    refreshToken: json.data.refresh_token || params.refreshToken,
    advertiserId: params.advertiserId,
    catalogId: params.catalogId,
    catalogName: params.catalogName,
  });
  return json.data.access_token;
}

async function tiktokGetJson<T>(params: {
  path: string;
  accessToken: string;
  query: Record<string, string>;
}): Promise<T> {
  const url = new URL(`${TIKTOK_API_BASE}${params.path}`);
  for (const [key, value] of Object.entries(params.query)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url.toString(), {
    headers: { "Access-Token": params.accessToken },
  });
  const json = (await response.json().catch(() => ({}))) as T & {
    code?: number;
    message?: string;
  };
  if (!response.ok || (json.code !== undefined && json.code !== 0)) {
    throw new Error(json.message || `HTTP ${response.status}`);
  }
  return json;
}

async function listCampaignMeta(params: {
  accessToken: string;
  advertiserId: string;
}): Promise<Map<string, { name: string; status: string }>> {
  const map = new Map<string, { name: string; status: string }>();
  let page = 1;
  let totalPage = 1;

  while (page <= totalPage && page <= 20) {
    const json = await tiktokGetJson<{
      data?: {
        list?: Array<{
          campaign_id?: string | number;
          campaign_name?: string;
          operation_status?: string;
          secondary_status?: string;
        }>;
        page_info?: { total_page?: number; page?: number };
      };
    }>({
      path: "/campaign/get/",
      accessToken: params.accessToken,
      query: {
        advertiser_id: params.advertiserId,
        page: String(page),
        page_size: "100",
      },
    });

    for (const row of json.data?.list ?? []) {
      const id = String(row.campaign_id ?? "").trim();
      if (!id) continue;
      map.set(id, {
        name: row.campaign_name?.trim() || id,
        status: row.operation_status || row.secondary_status || "UNKNOWN",
      });
    }

    totalPage = Math.max(1, Number(json.data?.page_info?.total_page ?? 1));
    page += 1;
  }

  return map;
}

async function fetchCampaignReport(params: {
  accessToken: string;
  advertiserId: string;
  startDate: string;
  endDate: string;
}): Promise<
  Array<{
    campaignId: string;
    impressions: number;
    clicks: number;
    spend: number;
    ctr: number;
    cpc: number;
    conversions: number;
    conversionRate: number;
  }>
> {
  const metrics = [
    "spend",
    "impressions",
    "clicks",
    "ctr",
    "cpc",
    "conversion",
    "conversion_rate",
  ];
  const json = await tiktokGetJson<{
    data?: {
      list?: Array<{
        dimensions?: { campaign_id?: string | number };
        metrics?: Record<string, string | number | undefined>;
      }>;
      page_info?: { total_page?: number };
    };
  }>({
    path: "/report/integrated/get/",
    accessToken: params.accessToken,
    query: {
      advertiser_id: params.advertiserId,
      report_type: "BASIC",
      data_level: "AUCTION_CAMPAIGN",
      dimensions: JSON.stringify(["campaign_id"]),
      metrics: JSON.stringify(metrics),
      start_date: params.startDate,
      end_date: params.endDate,
      page: "1",
      page_size: "1000",
    },
  });

  return (json.data?.list ?? [])
    .map((row) => {
      const campaignId = String(row.dimensions?.campaign_id ?? "").trim();
      const m = row.metrics ?? {};
      const impressions = toNumber(m.impressions);
      const clicks = toNumber(m.clicks);
      const spend = toNumber(m.spend);
      const conversions = toNumber(m.conversion);
      return {
        campaignId,
        impressions,
        clicks,
        spend,
        ctr: toNumber(m.ctr) || (impressions > 0 ? clicks / impressions : 0),
        cpc: toNumber(m.cpc) || (clicks > 0 ? spend / clicks : 0),
        conversions,
        conversionRate:
          toNumber(m.conversion_rate) || (clicks > 0 ? conversions / clicks : 0),
      };
    })
    .filter((row) => Boolean(row.campaignId));
}

export async function fetchTiktokAdsMetrics(
  shop: string,
): Promise<TiktokAdsMetricsResult | null> {
  const credential = await getTiktokCatalogCredential(shop);
  if (!credential) return null;

  let accessToken = credential.accessToken;
  const { startDate, endDate } = last7DaysRange();

  const run = async (token: string) => {
    const [campaignMeta, reportRows] = await Promise.all([
      listCampaignMeta({
        accessToken: token,
        advertiserId: credential.advertiserId,
      }),
      fetchCampaignReport({
        accessToken: token,
        advertiserId: credential.advertiserId,
        startDate,
        endDate,
      }),
    ]);

    const campaigns: TiktokAdsCampaignMetrics[] = reportRows.map((row) => {
      const meta = campaignMeta.get(row.campaignId);
      return {
        campaignId: row.campaignId,
        campaignName: meta?.name ?? row.campaignId,
        campaignStatus: meta?.status ?? "UNKNOWN",
        impressions: row.impressions,
        clicks: row.clicks,
        costAmount: row.spend,
        ctr: row.ctr,
        averageCpc: row.cpc,
        conversions: row.conversions,
        conversionsValue: 0,
        conversionRate: row.conversionRate,
      };
    });

    campaigns.sort((a, b) => b.costAmount - a.costAmount);

    return {
      advertiserId: credential.advertiserId,
      dateRange: "LAST_7_DAYS" as const,
      campaigns,
      currencyCode: null,
    };
  };

  try {
    return await run(accessToken);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const maybeAuthError = /token|auth|unauthorized|access/i.test(message);
    if (maybeAuthError && credential.refreshToken) {
      try {
        const refreshed = await refreshTiktokAccessToken({
          shop,
          refreshToken: credential.refreshToken,
          advertiserId: credential.advertiserId,
          catalogId: credential.catalogId,
          catalogName: credential.catalogName,
        });
        if (refreshed) {
          accessToken = refreshed;
          return await run(accessToken);
        }
      } catch (refreshError) {
        console.error(
          `${LOG_PREFIX} refresh+retry failed shop=${shop} ${formatOutboundErrorLog(refreshError)}`,
        );
      }
    }
    console.error(
      `${LOG_PREFIX} fetch failed shop=${shop} ${formatOutboundErrorLog(error)}`,
    );
    throw new Error(formatOutboundNetworkError(error));
  }
}
