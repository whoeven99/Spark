/**
 * TikTok Ads 广告洞察：Ad 级别 integrated report + 实体名称补齐。
 */

import {
  getTiktokCatalogCredential,
  setTiktokCatalogCredential,
} from "../adsCatalog/credentialStore.server";
import {
  TIKTOK_API_BASE,
  TIKTOK_REFRESH_TOKEN_URL,
  getTiktokAppCredentials,
} from "../adsCatalog/tiktokOAuth.server";
import {
  formatOutboundErrorLog,
  formatOutboundNetworkError,
} from "../common/outboundError.server";
import { resolveDateWindow } from "./dateRange.server";
import { nestFlatAdRows } from "./nest.server";
import {
  type AdsInsightsRangeDays,
  type AdsInsightsResult,
  finalizeMetrics,
  toNumber,
} from "./types.server";

const LOG_PREFIX = "[AdsInsights][TikTok]";

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
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: { "Access-Token": params.accessToken },
    });
  } catch (e) {
    throw new Error(`TikTok API 网络请求失败: ${formatOutboundNetworkError(e)}`, { cause: e });
  }
  const json = (await response.json().catch(() => ({}))) as T & {
    code?: number;
    message?: string;
  };
  if (!response.ok || (json.code !== undefined && json.code !== 0)) {
    throw new Error(json.message || `TikTok HTTP ${response.status}`);
  }
  return json;
}

async function listEntityNames(params: {
  accessToken: string;
  advertiserId: string;
  path: string;
  idField: string;
  nameField: string;
  statusField: string;
}): Promise<Map<string, { name: string; status: string }>> {
  const map = new Map<string, { name: string; status: string }>();
  let page = 1;
  let totalPage = 1;
  while (page <= totalPage && page <= 20) {
    const json = await tiktokGetJson<{
      data?: {
        list?: Array<Record<string, string | number | undefined>>;
        page_info?: { total_page?: number };
      };
    }>({
      path: params.path,
      accessToken: params.accessToken,
      query: {
        advertiser_id: params.advertiserId,
        page: String(page),
        page_size: "100",
      },
    });
    for (const row of json.data?.list ?? []) {
      const id = String(row[params.idField] ?? "").trim();
      if (!id) continue;
      map.set(id, {
        name: String(row[params.nameField] ?? id).trim() || id,
        status: String(row[params.statusField] ?? row.secondary_status ?? "UNKNOWN"),
      });
    }
    totalPage = Math.max(1, Number(json.data?.page_info?.total_page ?? 1));
    page += 1;
  }
  return map;
}

const REPORT_METRICS = [
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "cpc",
  "conversion",
  "conversion_rate",
  "complete_payment",
  "total_complete_payment_rate",
  "total_purchase_value",
  "web_event_add_to_cart",
  "landing_page_view",
  "reach",
  "frequency",
] as const;

export async function fetchTiktokAdsInsights(
  shop: string,
  rangeDays: AdsInsightsRangeDays,
): Promise<AdsInsightsResult | null> {
  const credential = await getTiktokCatalogCredential(shop);
  if (!credential) return null;

  const { dateStart, dateEnd } = resolveDateWindow(rangeDays);
  let accessToken = credential.accessToken;
  if (credential.refreshToken) {
    const refreshed = await refreshTiktokAccessToken({
      shop,
      refreshToken: credential.refreshToken,
      advertiserId: credential.advertiserId,
      catalogId: credential.catalogId,
      catalogName: credential.catalogName,
    });
    if (refreshed) accessToken = refreshed;
  }

  const [campaignMeta, adgroupMeta, adMeta] = await Promise.all([
    listEntityNames({
      accessToken,
      advertiserId: credential.advertiserId,
      path: "/campaign/get/",
      idField: "campaign_id",
      nameField: "campaign_name",
      statusField: "operation_status",
    }),
    listEntityNames({
      accessToken,
      advertiserId: credential.advertiserId,
      path: "/adgroup/get/",
      idField: "adgroup_id",
      nameField: "adgroup_name",
      statusField: "operation_status",
    }),
    listEntityNames({
      accessToken,
      advertiserId: credential.advertiserId,
      path: "/ad/get/",
      idField: "ad_id",
      nameField: "ad_name",
      statusField: "operation_status",
    }),
  ]);

  let reportList: Array<{
    dimensions?: {
      campaign_id?: string | number;
      adgroup_id?: string | number;
      ad_id?: string | number;
    };
    metrics?: Record<string, string | number | undefined>;
  }> = [];

  try {
    // 部分账户不支持全部扩展指标；失败时降级到基础指标集。
    const tryMetrics = async (metrics: readonly string[]) => {
      const json = await tiktokGetJson<{
        data?: {
          list?: typeof reportList;
        };
      }>({
        path: "/report/integrated/get/",
        accessToken,
        query: {
          advertiser_id: credential.advertiserId,
          report_type: "BASIC",
          data_level: "AUCTION_AD",
          dimensions: JSON.stringify(["campaign_id", "adgroup_id", "ad_id"]),
          metrics: JSON.stringify([...metrics]),
          start_date: dateStart,
          end_date: dateEnd,
          page: "1",
          page_size: "1000",
        },
      });
      return json.data?.list ?? [];
    };

    try {
      reportList = await tryMetrics(REPORT_METRICS);
    } catch (e) {
      console.warn(
        `${LOG_PREFIX} step=report_extended_failed shop=${shop} ${formatOutboundErrorLog(e)}`,
      );
      reportList = await tryMetrics([
        "spend",
        "impressions",
        "clicks",
        "ctr",
        "cpc",
        "conversion",
        "conversion_rate",
      ]);
    }
  } catch (e) {
    console.error(`${LOG_PREFIX} step=report shop=${shop} ${formatOutboundErrorLog(e)}`);
    throw e;
  }

  const flat = reportList
    .map((row) => {
      const campaignId = String(row.dimensions?.campaign_id ?? "").trim();
      const adSetId = String(row.dimensions?.adgroup_id ?? "").trim();
      const adId = String(row.dimensions?.ad_id ?? "").trim();
      const m = row.metrics ?? {};
      const impressions = toNumber(m.impressions);
      const clicks = toNumber(m.clicks);
      const spend = toNumber(m.spend);
      const conversions = toNumber(m.conversion);
      const purchasesRaw = toNumber(m.complete_payment);
      const purchaseValueRaw = toNumber(m.total_purchase_value);
      const atcRaw = toNumber(m.web_event_add_to_cart);
      const lpvRaw = toNumber(m.landing_page_view);
      const reachRaw = toNumber(m.reach);
      const frequencyRaw = toNumber(m.frequency);
      const campaign = campaignMeta.get(campaignId);
      const adSet = adgroupMeta.get(adSetId);
      const ad = adMeta.get(adId);

      // TikTok CTR 通常已是百分比
      const ctrRaw = toNumber(m.ctr);
      const ctr = ctrRaw > 1 ? ctrRaw / 100 : ctrRaw;

      return {
        campaignId,
        campaignName: campaign?.name ?? campaignId,
        campaignStatus: campaign?.status ?? "UNKNOWN",
        adSetId,
        adSetName: adSet?.name ?? adSetId,
        adSetStatus: adSet?.status ?? "UNKNOWN",
        adId,
        adName: ad?.name ?? adId,
        adStatus: ad?.status ?? "UNKNOWN",
        metrics: finalizeMetrics({
          impressions,
          clicks,
          spend,
          ctr,
          cpc: toNumber(m.cpc),
          conversions,
          conversionsValue: purchaseValueRaw,
          conversionRate: toNumber(m.conversion_rate) || undefined,
          purchases: m.complete_payment !== undefined ? purchasesRaw : null,
          purchaseValue: m.total_purchase_value !== undefined ? purchaseValueRaw : null,
          addToCart: m.web_event_add_to_cart !== undefined ? atcRaw : null,
          landingPageViews: m.landing_page_view !== undefined ? lpvRaw : null,
          reach: m.reach !== undefined ? reachRaw : null,
          frequency: m.frequency !== undefined ? frequencyRaw : null,
        }),
      };
    })
    .filter((r) => r.campaignId && r.adSetId && r.adId);

  return {
    platform: "tiktok",
    accountId: credential.advertiserId,
    currencyCode: null,
    rangeDays,
    dateStart,
    dateEnd,
    campaigns: nestFlatAdRows(flat),
  };
}
