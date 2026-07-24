/**
 * TikTok Ads 广告洞察：Ad 级别 integrated report + 实体名称补齐。
 */

import {
  getTiktokAdsInsightsCredential,
  persistTiktokAdsInsightsTokens,
  type TiktokAdsInsightsCredential,
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
import { mergeEntityAdsWithFlatMetrics, nestEntityHierarchy } from "./nest.server";
import {
  getTiktokSandboxCredentials,
  isTiktokSandboxApiBase,
  tiktokSandboxRequest,
  TIKTOK_SANDBOX_API_BASE,
} from "./tiktokSandbox.server";
import {
  type AdsInsightsCampaign,
  type AdsInsightsDeepRow,
  type AdsInsightsRangeDays,
  type AdsInsightsResult,
  emptyMetrics,
  finalizeMetrics,
  toNumber,
} from "./types.server";

const LOG_PREFIX = "[AdsInsights][TikTok]";

async function refreshTiktokAccessToken(params: {
  shop: string;
  credential: TiktokAdsInsightsCredential;
}): Promise<string | null> {
  const refreshToken = params.credential.refreshToken;
  if (!refreshToken) return null;

  const { appId, appSecret } = getTiktokAppCredentials();
  if (!appId || !appSecret) return null;

  const response = await fetch(TIKTOK_REFRESH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: appId,
      secret: appSecret,
      refresh_token: refreshToken,
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

  await persistTiktokAdsInsightsTokens(params.shop, params.credential, {
    accessToken: json.data.access_token,
    refreshToken: json.data.refresh_token || refreshToken,
  });
  return json.data.access_token;
}

async function tiktokGetJson<T>(params: {
  path: string;
  accessToken: string;
  query: Record<string, string>;
  apiBase?: string;
}): Promise<T> {
  if (isTiktokSandboxApiBase(params.apiBase)) {
    return tiktokSandboxRequest<T>({
      path: params.path,
      accessToken: params.accessToken,
      query: params.query,
      apiBase: params.apiBase,
    });
  }

  const apiBase = params.apiBase ?? TIKTOK_API_BASE;
  const url = new URL(`${apiBase}${params.path}`);
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
  apiBase?: string;
  extraFields?: string[];
  parentField?: string;
}): Promise<Map<string, { name: string; status: string; parentId?: string }>> {
  const map = new Map<string, { name: string; status: string; parentId?: string }>();
  let page = 1;
  let totalPage = 1;
  while (page <= totalPage && page <= 20) {
    const query: Record<string, string> = {
      advertiser_id: params.advertiserId,
      page: String(page),
      page_size: "100",
    };
    if (params.extraFields?.length) {
      query.fields = JSON.stringify(params.extraFields);
    }
    const json = await tiktokGetJson<{
      data?: {
        list?: Array<Record<string, string | number | undefined>>;
        page_info?: { total_page?: number };
      };
    }>({
      path: params.path,
      accessToken: params.accessToken,
      apiBase: params.apiBase,
      query,
    });
    for (const row of json.data?.list ?? []) {
      const id = String(row[params.idField] ?? "").trim();
      if (!id) continue;
      const parentRaw = params.parentField ? row[params.parentField] : undefined;
      map.set(id, {
        name: String(row[params.nameField] ?? id).trim() || id,
        status: String(row[params.statusField] ?? row.secondary_status ?? "UNKNOWN"),
        parentId: parentRaw !== undefined ? String(parentRaw).trim() || undefined : undefined,
      });
    }
    totalPage = Math.max(1, Number(json.data?.page_info?.total_page ?? 1));
    page += 1;
  }
  return map;
}

async function listAdsWithParents(params: {
  accessToken: string;
  advertiserId: string;
  apiBase?: string;
}): Promise<
  Array<{
    id: string;
    name: string;
    status: string;
    campaignId: string;
    adSetId: string;
  }>
> {
  const out: Array<{
    id: string;
    name: string;
    status: string;
    campaignId: string;
    adSetId: string;
  }> = [];
  let page = 1;
  let totalPage = 1;
  while (page <= totalPage && page <= 20) {
    const json = await tiktokGetJson<{
      data?: {
        list?: Array<Record<string, string | number | undefined>>;
        page_info?: { total_page?: number };
      };
    }>({
      path: "/ad/get/",
      accessToken: params.accessToken,
      apiBase: params.apiBase,
      query: {
        advertiser_id: params.advertiserId,
        page: String(page),
        page_size: "100",
        fields: JSON.stringify([
          "ad_id",
          "ad_name",
          "operation_status",
          "campaign_id",
          "adgroup_id",
        ]),
      },
    });
    for (const row of json.data?.list ?? []) {
      const id = String(row.ad_id ?? "").trim();
      const campaignId = String(row.campaign_id ?? "").trim();
      const adSetId = String(row.adgroup_id ?? "").trim();
      if (!id || !campaignId || !adSetId) continue;
      out.push({
        id,
        name: String(row.ad_name ?? id).trim() || id,
        status: String(row.operation_status ?? row.secondary_status ?? "UNKNOWN"),
        campaignId,
        adSetId,
      });
    }
    totalPage = Math.max(1, Number(json.data?.page_info?.total_page ?? 1));
    page += 1;
  }
  return out;
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
  apiBase?: string;
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
      apiBase: params.apiBase,
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
  apiBase?: string;
}): Promise<string | null> {
  try {
    const json = await tiktokGetJson<{
      data?: { list?: Array<{ currency?: string; advertiser_id?: string | number }> };
    }>({
      path: "/advertiser/info/",
      accessToken: params.accessToken,
      apiBase: params.apiBase,
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
  options?: { includeCreatives?: boolean; sandbox?: boolean },
): Promise<AdsInsightsResult | null> {
  const sandbox = Boolean(options?.sandbox);
  const apiBase = sandbox ? TIKTOK_SANDBOX_API_BASE : TIKTOK_API_BASE;

  let accessToken: string;
  let advertiserId: string;
  let accountName: string | null = null;

  if (sandbox) {
    const sandboxCreds = getTiktokSandboxCredentials();
    if (!sandboxCreds) return null;
    accessToken = sandboxCreds.accessToken;
    advertiserId = sandboxCreds.advertiserId;
    accountName = sandboxCreds.accountName;
  } else {
    const credential = await getTiktokAdsInsightsCredential(shop);
    if (!credential) return null;
    accessToken = credential.accessToken;
    advertiserId = credential.advertiserId;
    if (credential.refreshToken) {
      const refreshed = await refreshTiktokAccessToken({
        shop,
        credential,
      });
      if (refreshed) accessToken = refreshed;
    }
  }

  const { dateStart, dateEnd } = resolveDateWindow(rangeDays);
  const logShop = sandbox ? `sandbox:${advertiserId}` : shop;

  const [campaignMeta, adgroupMeta, adsWithParents, currencyCode] = await Promise.all([
    listEntityNames({
      accessToken,
      advertiserId,
      apiBase,
      path: "/campaign/get/",
      idField: "campaign_id",
      nameField: "campaign_name",
      statusField: "operation_status",
      extraFields: ["campaign_id", "campaign_name", "operation_status"],
    }),
    listEntityNames({
      accessToken,
      advertiserId,
      apiBase,
      path: "/adgroup/get/",
      idField: "adgroup_id",
      nameField: "adgroup_name",
      statusField: "operation_status",
      parentField: "campaign_id",
      extraFields: ["adgroup_id", "adgroup_name", "operation_status", "campaign_id"],
    }),
    listAdsWithParents({ accessToken, advertiserId, apiBase }),
    fetchAdvertiserCurrency({ accessToken, advertiserId, apiBase }),
  ]);

  const adMeta = new Map(
    adsWithParents.map((ad) => [ad.id, { name: ad.name, status: ad.status }] as const),
  );

  let reportList: ReportRow[] = [];
  let usedExtended = true;

  // 沙盒无真实投放，跳过报表接口（沙盒报表 API 对空账号可能报错）。
  if (!sandbox) {
    try {
      try {
        reportList = await fetchReportPages({
          accessToken,
          advertiserId,
          apiBase,
          dateStart,
          dateEnd,
          metrics: REPORT_METRICS_EXTENDED,
        });
      } catch (e) {
        usedExtended = false;
        console.warn(
          `${LOG_PREFIX} step=report_extended_failed shop=${logShop} sandbox=${sandbox} ${formatOutboundErrorLog(e)}`,
        );
        reportList = await fetchReportPages({
          accessToken,
          advertiserId,
          apiBase,
          dateStart,
          dateEnd,
          metrics: REPORT_METRICS_BASE,
        });
      }
    } catch (e) {
      console.error(`${LOG_PREFIX} step=report shop=${logShop} ${formatOutboundErrorLog(e)}`);
      throw e;
    }
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
  let campaigns: AdsInsightsCampaign[] = [];
  if (!wantCreatives) {
    campaigns = nestEntityHierarchy({
      campaigns: [...campaignMeta.entries()].map(([id, v]) => ({
        id,
        name: v.name,
        status: v.status,
      })),
      adSets: [...adgroupMeta.entries()].map(([id, v]) => ({
        id,
        name: v.name,
        status: v.status,
        campaignId: v.parentId || "",
      })),
      ads: sandbox
        ? adsWithParents.map((ad) => ({
            ...ad,
            metrics: emptyMetrics(),
          }))
        : mergeEntityAdsWithFlatMetrics(adsWithParents, flat),
    });
  }

  let creatives: AdsInsightsDeepRow[] = wantCreatives
    ? (flat.length > 0
        ? flat
        : adsWithParents.map((ad) => {
            const campaign = campaignMeta.get(ad.campaignId);
            const adSet = adgroupMeta.get(ad.adSetId);
            return {
              campaignId: ad.campaignId,
              campaignName: campaign?.name ?? ad.campaignId,
              campaignStatus: campaign?.status ?? "UNKNOWN",
              adSetId: ad.adSetId,
              adSetName: adSet?.name ?? ad.adSetId,
              adSetStatus: adSet?.status ?? "UNKNOWN",
              adId: ad.id,
              adName: ad.name,
              adStatus: ad.status,
              metrics: emptyMetrics(),
            };
          })
      ).map((row) => ({
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
    accountId: advertiserId,
    accountName,
    sandbox,
    currencyCode,
    rangeDays,
    dateStart,
    dateEnd,
    campaigns,
    keywords: [],
    searchTerms: [],
    creatives,
  };
}
