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
  type AdsInsightsDeepRow,
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

const REPORT_METRICS_EXTENDED = [
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "conversion",
  "conversion_rate",
  "complete_payment",
  "total_complete_payment_rate",
  "total_purchase_value",
  "web_event_add_to_cart",
  "landing_page_view",
  "reach",
  "frequency",
  "video_play_actions",
  "video_watched_2s",
  "video_views_p100",
] as const;

const REPORT_METRICS_BASE = [
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "cpc",
  "conversion",
  "conversion_rate",
] as const;

/**
 * AUCTION_AD 层级只能用 ad_id 做 dimension；
 * campaign_id / adgroup_id 必须放进 metrics，否则 TikTok 会报
 * "data_level AUCTION_AD and dimension campaign_id do not match"。
 */
const REPORT_ID_METRICS = ["campaign_id", "adgroup_id"] as const;

type ReportRow = {
  dimensions?: {
    ad_id?: string | number;
  };
  metrics?: Record<string, string | number | undefined>;
};

async function fetchReportPages(params: {
  accessToken: string;
  advertiserId: string;
  dateStart: string;
  dateEnd: string;
  metrics: readonly string[];
  dataLevel?: string;
}): Promise<ReportRow[]> {
  const out: ReportRow[] = [];
  let page = 1;
  let totalPage = 1;
  while (page <= totalPage && page <= 50) {
    const json = await tiktokGetJson<{
      data?: {
        list?: ReportRow[];
        page_info?: { total_page?: number; page?: number };
      };
    }>({
      path: "/report/integrated/get/",
      accessToken: params.accessToken,
      query: {
        advertiser_id: params.advertiserId,
        report_type: "BASIC",
        data_level: params.dataLevel ?? "AUCTION_AD",
        dimensions: JSON.stringify(["ad_id"]),
        metrics: JSON.stringify([...REPORT_ID_METRICS, ...params.metrics]),
        start_date: params.dateStart,
        end_date: params.dateEnd,
        page: String(page),
        page_size: "1000",
      },
    });
    out.push(...(json.data?.list ?? []));
    totalPage = Math.max(1, Number(json.data?.page_info?.total_page ?? 1));
    page += 1;
  }
  return out;
}

async function fetchAdvertiserCurrency(params: {
  accessToken: string;
  advertiserId: string;
}): Promise<string | null> {
  try {
    const json = await tiktokGetJson<{
      data?: { list?: Array<{ currency?: string; advertiser_id?: string | number }> };
    }>({
      path: "/advertiser/info/",
      accessToken: params.accessToken,
      query: {
        advertiser_ids: JSON.stringify([params.advertiserId]),
        fields: JSON.stringify(["advertiser_id", "currency"]),
      },
    });
    const row = json.data?.list?.[0];
    return row?.currency?.trim() || null;
  } catch (e) {
    console.warn(`${LOG_PREFIX} step=currency ${formatOutboundErrorLog(e)}`);
    return null;
  }
}

function mapReportMetrics(m: Record<string, string | number | undefined>) {
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
  const ctrRaw = toNumber(m.ctr);
  const ctr = ctrRaw > 1 ? ctrRaw / 100 : ctrRaw;
  const cpmRaw = toNumber(m.cpm);
  const videoViews =
    m.video_play_actions !== undefined
      ? toNumber(m.video_play_actions)
      : m.video_watched_2s !== undefined
        ? toNumber(m.video_watched_2s)
        : null;

  return finalizeMetrics({
    impressions,
    clicks,
    spend,
    ctr,
    cpc: toNumber(m.cpc),
    cpm: m.cpm !== undefined ? cpmRaw : null,
    conversions,
    conversionsValue: purchaseValueRaw,
    conversionRate: toNumber(m.conversion_rate) || undefined,
    purchases: m.complete_payment !== undefined ? purchasesRaw : null,
    purchaseValue: m.total_purchase_value !== undefined ? purchaseValueRaw : null,
    addToCart: m.web_event_add_to_cart !== undefined ? atcRaw : null,
    landingPageViews: m.landing_page_view !== undefined ? lpvRaw : null,
    reach: m.reach !== undefined ? reachRaw : null,
    frequency: m.frequency !== undefined ? frequencyRaw : null,
    videoViews,
    thruplay: m.video_views_p100 !== undefined ? toNumber(m.video_views_p100) : null,
  });
}

export async function fetchTiktokAdsInsights(
  shop: string,
  rangeDays: AdsInsightsRangeDays,
  options?: { includeCreatives?: boolean },
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

  const [campaignMeta, adgroupMeta, adMeta, currencyCode] = await Promise.all([
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
    fetchAdvertiserCurrency({
      accessToken,
      advertiserId: credential.advertiserId,
    }),
  ]);

  let reportList: ReportRow[] = [];
  let usedExtended = true;

  try {
    try {
      reportList = await fetchReportPages({
        accessToken,
        advertiserId: credential.advertiserId,
        dateStart,
        dateEnd,
        metrics: REPORT_METRICS_EXTENDED,
      });
    } catch (e) {
      usedExtended = false;
      console.warn(
        `${LOG_PREFIX} step=report_extended_failed shop=${shop} ${formatOutboundErrorLog(e)}`,
      );
      reportList = await fetchReportPages({
        accessToken,
        advertiserId: credential.advertiserId,
        dateStart,
        dateEnd,
        metrics: REPORT_METRICS_BASE,
      });
    }
  } catch (e) {
    console.error(`${LOG_PREFIX} step=report shop=${shop} ${formatOutboundErrorLog(e)}`);
    throw e;
  }

  const flat = reportList
    .map((row) => {
      const m = row.metrics ?? {};
      const campaignId = String(m.campaign_id ?? "").trim();
      const adSetId = String(m.adgroup_id ?? "").trim();
      const adId = String(row.dimensions?.ad_id ?? "").trim();
      const campaign = campaignMeta.get(campaignId);
      const adSet = adgroupMeta.get(adSetId);
      const ad = adMeta.get(adId);

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
        metrics: mapReportMetrics(m),
      };
    })
    .filter((r) => r.campaignId && r.adSetId && r.adId);

  // 扩展指标失败时，至少保留基础字段；购买等字段保持 null 而非静默变 0。
  if (!usedExtended) {
    for (const row of flat) {
      row.metrics = finalizeMetrics({
        ...row.metrics,
        purchases: null,
        purchaseValue: null,
        addToCart: null,
        landingPageViews: null,
        reach: null,
        frequency: null,
        videoViews: null,
        thruplay: null,
        cpm: null,
      });
    }
  }

  const wantCreatives = Boolean(options?.includeCreatives);
  const creatives: AdsInsightsDeepRow[] = wantCreatives
    ? flat.map((row) => ({
        id: row.adId,
        name: row.adName,
        status: row.adStatus,
        campaignId: row.campaignId,
        campaignName: row.campaignName,
        adSetId: row.adSetId,
        adSetName: row.adSetName,
        adId: row.adId,
        adName: row.adName,
        detail: null,
        metrics: row.metrics,
      }))
    : [];

  return {
    platform: "tiktok",
    accountId: credential.advertiserId,
    currencyCode,
    rangeDays,
    dateStart,
    dateEnd,
    campaigns: wantCreatives ? [] : nestFlatAdRows(flat),
    keywords: [],
    searchTerms: [],
    creatives,
  };
}
