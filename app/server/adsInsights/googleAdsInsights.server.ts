/**
 * Google Ads 广告洞察：Ad 级别 GAQL + 转化动作分类补齐购买/加购。
 * 可选拉取 keyword / search term / asset 深层级。
 */

import {
  getGoogleAdsCredential,
  setGoogleAdsCredential,
} from "../adsCatalog/credentialStore.server";
import {
  maybeRefreshGoogleAdsToken,
  resolveVerifiedLoginCustomerId,
} from "../adsCatalog/googleAdsToken.server";
import {
  getGoogleAdsDeveloperToken,
} from "../adsCatalog/googleOAuth.server";
import {
  buildGoogleAdsHeaders,
  formatGoogleAdsUserError,
  googleAdsApiUrl,
  isGoogleAdsPermissionError,
  normalizeCustomerId,
  parseGoogleAdsError,
  resolveLoginCustomerId,
} from "../adsCatalog/googleAdsApi.server";
import {
  formatOutboundErrorLog,
  formatOutboundNetworkError,
} from "../common/outboundError.server";
import { googleDuringClause, resolveDateWindow } from "./dateRange.server";
import { nestFlatAdRows } from "./nest.server";
import {
  type AdsInsightsDeepRow,
  type AdsInsightsRangeDays,
  type AdsInsightsResult,
  finalizeMetrics,
  toNumber,
} from "./types.server";

const LOG_PREFIX = "[AdsInsights][Google]";

interface GaqlRow {
  campaign?: { id?: string; name?: string; status?: string };
  adGroup?: { id?: string; name?: string; status?: string };
  adGroupAd?: {
    status?: string;
    ad?: { id?: string; name?: string; type?: string };
  };
  adGroupCriterion?: {
    criterion_id?: string;
    keyword?: { text?: string; match_type?: string };
    status?: string;
  };
  searchTermView?: { search_term?: string; status?: string };
  asset?: { id?: string; name?: string; type?: string };
  metrics?: Record<string, string | number | undefined>;
  customer?: { currency_code?: string };
  segments?: { conversion_action_category?: string };
}

interface SearchStreamResponse {
  results?: GaqlRow[];
}

type QueryParams = {
  accessToken: string;
  developerToken: string;
  customerId: string;
  loginCustomerId: string;
};

async function executeGaqlQuery(params: QueryParams & { query: string }): Promise<GaqlRow[]> {
  const cleanId = normalizeCustomerId(params.customerId);
  const url = googleAdsApiUrl(`/customers/${cleanId}/googleAds:searchStream`);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        ...buildGoogleAdsHeaders({
          accessToken: params.accessToken,
          developerToken: params.developerToken,
          loginCustomerId: params.loginCustomerId,
        }),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: params.query }),
    });
  } catch (e) {
    throw new Error(`Google Ads API 网络请求失败: ${formatOutboundNetworkError(e)}`, {
      cause: e,
    });
  }

  const text = await response.text();
  if (!response.ok) {
    const detail = parseGoogleAdsError(text, response.status);
    throw new Error(formatGoogleAdsUserError(detail));
  }

  let batches: SearchStreamResponse[] = [];
  try {
    const parsed = JSON.parse(text) as SearchStreamResponse | SearchStreamResponse[];
    batches = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    throw new Error("Google Ads API 返回了无效的 JSON 数据");
  }
  return batches.flatMap((b) => b.results ?? []);
}

type ConvKey = string;

function convMapKey(campaignId: string, adGroupId: string, adId: string): ConvKey {
  return `${campaignId}|${adGroupId}|${adId}`;
}

async function fetchConversionCategoryMap(params: QueryParams & {
  during: string;
  category: "PURCHASE" | "ADD_TO_CART" | "PAGE_VIEW";
}): Promise<Map<ConvKey, { conversions: number; value: number }>> {
  const map = new Map<ConvKey, { conversions: number; value: number }>();
  const query = `
    SELECT
      campaign.id,
      ad_group.id,
      ad_group_ad.ad.id,
      metrics.conversions,
      metrics.conversions_value,
      segments.conversion_action_category
    FROM ad_group_ad
    WHERE segments.date DURING ${params.during}
      AND segments.conversion_action_category = '${params.category}'
      AND campaign.status != 'REMOVED'
  `;
  try {
    const rows = await executeGaqlQuery({ ...params, query });
    for (const row of rows) {
      const campaignId = row.campaign?.id ?? "";
      const adGroupId = row.adGroup?.id ?? "";
      const adId = row.adGroupAd?.ad?.id ?? "";
      if (!campaignId || !adGroupId || !adId) continue;
      const key = convMapKey(campaignId, adGroupId, adId);
      const prev = map.get(key) ?? { conversions: 0, value: 0 };
      map.set(key, {
        conversions: prev.conversions + toNumber(row.metrics?.conversions),
        value: prev.value + toNumber(row.metrics?.conversions_value),
      });
    }
  } catch (e) {
    console.warn(
      `${LOG_PREFIX} step=conversion_category category=${params.category} ${formatOutboundErrorLog(e)}`,
    );
  }
  return map;
}

function metricsFromGaql(row: GaqlRow) {
  const costMicros = toNumber(row.metrics?.cost_micros);
  const spend = costMicros / 1_000_000;
  const clicks = toNumber(row.metrics?.clicks);
  const impressions = toNumber(row.metrics?.impressions);
  const conversions = toNumber(row.metrics?.conversions);
  const conversionsValue = toNumber(row.metrics?.conversions_value);
  const averageCpcMicros = toNumber(row.metrics?.average_cpc);
  const averageCpmMicros = toNumber(row.metrics?.average_cpm);
  return finalizeMetrics({
    impressions,
    clicks,
    spend,
    ctr: toNumber(row.metrics?.ctr),
    cpc: averageCpcMicros / 1_000_000,
    cpm: averageCpmMicros > 0 ? averageCpmMicros / 1_000_000 : null,
    conversions,
    conversionsValue,
    allConversions: row.metrics?.all_conversions !== undefined
      ? toNumber(row.metrics.all_conversions)
      : null,
  });
}

async function fetchKeywords(
  params: QueryParams & { during: string },
): Promise<AdsInsightsDeepRow[]> {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      ad_group.id,
      ad_group.name,
      ad_group_criterion.criterion_id,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.ctr,
      metrics.average_cpc,
      metrics.average_cpm,
      metrics.conversions,
      metrics.conversions_value,
      metrics.all_conversions
    FROM keyword_view
    WHERE segments.date DURING ${params.during}
      AND campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `;
  try {
    const rows = await executeGaqlQuery({ ...params, query });
    const out: AdsInsightsDeepRow[] = [];
    for (const row of rows) {
      const id = String(row.adGroupCriterion?.criterion_id ?? "").trim();
      const text = row.adGroupCriterion?.keyword?.text?.trim() || id;
      if (!id && !text) continue;
      const matchType = row.adGroupCriterion?.keyword?.match_type ?? "";
      out.push({
        id: id || text,
        name: text,
        status: row.adGroupCriterion?.status ?? "UNKNOWN",
        campaignId: row.campaign?.id ?? null,
        campaignName: row.campaign?.name ?? null,
        adSetId: row.adGroup?.id ?? null,
        adSetName: row.adGroup?.name ?? null,
        adId: null,
        adName: null,
        detail: matchType || null,
        metrics: metricsFromGaql(row),
      });
    }
    return out;
  } catch (e) {
    console.warn(`${LOG_PREFIX} step=keywords ${formatOutboundErrorLog(e)}`);
    return [];
  }
}

async function fetchSearchTerms(
  params: QueryParams & { during: string },
): Promise<AdsInsightsDeepRow[]> {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      ad_group.id,
      ad_group.name,
      search_term_view.search_term,
      search_term_view.status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.ctr,
      metrics.average_cpc,
      metrics.average_cpm,
      metrics.conversions,
      metrics.conversions_value,
      metrics.all_conversions
    FROM search_term_view
    WHERE segments.date DURING ${params.during}
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `;
  try {
    const rows = await executeGaqlQuery({ ...params, query });
    const out: AdsInsightsDeepRow[] = [];
    for (const row of rows) {
      const term = row.searchTermView?.search_term?.trim() || "";
      if (!term) continue;
      out.push({
        id: `${row.campaign?.id ?? ""}|${row.adGroup?.id ?? ""}|${term}`,
        name: term,
        status: row.searchTermView?.status ?? "UNKNOWN",
        campaignId: row.campaign?.id ?? null,
        campaignName: row.campaign?.name ?? null,
        adSetId: row.adGroup?.id ?? null,
        adSetName: row.adGroup?.name ?? null,
        adId: null,
        adName: null,
        detail: null,
        metrics: metricsFromGaql(row),
      });
    }
    return out;
  } catch (e) {
    console.warn(`${LOG_PREFIX} step=search_terms ${formatOutboundErrorLog(e)}`);
    return [];
  }
}

async function fetchCreatives(
  params: QueryParams & { during: string },
): Promise<AdsInsightsDeepRow[]> {
  // ad_group_ad 已是创意载体；补充 ad type 作为素材视图
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      ad_group.id,
      ad_group.name,
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.ad.type,
      ad_group_ad.status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.ctr,
      metrics.average_cpc,
      metrics.average_cpm,
      metrics.conversions,
      metrics.conversions_value,
      metrics.all_conversions
    FROM ad_group_ad
    WHERE segments.date DURING ${params.during}
      AND campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
      AND ad_group_ad.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `;
  try {
    const rows = await executeGaqlQuery({ ...params, query });
    const out: AdsInsightsDeepRow[] = [];
    for (const row of rows) {
      const adId = row.adGroupAd?.ad?.id ?? "";
      if (!adId) continue;
      out.push({
        id: adId,
        name: row.adGroupAd?.ad?.name?.trim() || adId,
        status: row.adGroupAd?.status ?? "UNKNOWN",
        campaignId: row.campaign?.id ?? null,
        campaignName: row.campaign?.name ?? null,
        adSetId: row.adGroup?.id ?? null,
        adSetName: row.adGroup?.name ?? null,
        adId,
        adName: row.adGroupAd?.ad?.name ?? null,
        detail: row.adGroupAd?.ad?.type ?? null,
        metrics: metricsFromGaql(row),
      });
    }
    return out;
  } catch (e) {
    console.warn(`${LOG_PREFIX} step=creatives ${formatOutboundErrorLog(e)}`);
    return [];
  }
}

export async function fetchGoogleAdsInsights(
  shop: string,
  rangeDays: AdsInsightsRangeDays,
  options?: {
    includeStructure?: boolean;
    includeKeywords?: boolean;
    includeSearchTerms?: boolean;
    includeCreatives?: boolean;
  },
): Promise<AdsInsightsResult | null> {
  const developerToken = getGoogleAdsDeveloperToken();
  if (!developerToken) return null;

  const cred = await getGoogleAdsCredential(shop);
  if (!cred) return null;

  const { dateStart, dateEnd } = resolveDateWindow(rangeDays);
  const during = googleDuringClause(rangeDays);
  const accessToken = (await maybeRefreshGoogleAdsToken(shop)) ?? cred.accessToken;
  // 只信任带校验戳且未过期的 login-customer-id；其余情况重新探测。
  // 下方 GAQL 权限失败时还会强制重解析一次，作为权限变更的即时兜底。
  const loginCustomerId = await resolveVerifiedLoginCustomerId({
    shop,
    cred,
    accessToken,
    developerToken,
  });

  const queryParams: QueryParams = {
    accessToken,
    developerToken,
    customerId: cred.customerId,
    loginCustomerId,
  };

  const includeStructure = options?.includeStructure !== false;
  const wantKeywords = Boolean(options?.includeKeywords);
  const wantSearchTerms = Boolean(options?.includeSearchTerms);
  const wantCreatives = Boolean(options?.includeCreatives);

  let currencyCode: string | null = null;
  let campaigns: AdsInsightsResult["campaigns"] = [];

  if (includeStructure) {
    const baseQuery = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        ad_group.id,
        ad_group.name,
        ad_group.status,
        ad_group_ad.ad.id,
        ad_group_ad.ad.name,
        ad_group_ad.status,
        customer.currency_code,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.ctr,
        metrics.average_cpc,
        metrics.average_cpm,
        metrics.conversions,
        metrics.conversions_value,
        metrics.all_conversions
      FROM ad_group_ad
      WHERE segments.date DURING ${during}
        AND campaign.status != 'REMOVED'
        AND ad_group.status != 'REMOVED'
        AND ad_group_ad.status != 'REMOVED'
      ORDER BY metrics.cost_micros DESC
    `;

    let rows: GaqlRow[];
    try {
      rows = await executeGaqlQuery({ ...queryParams, query: baseQuery });
    } catch (e) {
      // 权限失败时再强制重解析一次（覆盖凭证里错误的 login-customer-id）。
      if (isGoogleAdsPermissionError(e)) {
        const retriedLogin = await resolveLoginCustomerId({
          accessToken,
          developerToken,
          customerId: cred.customerId,
        });
        console.warn(
          `${LOG_PREFIX} step=gaql_permission_retry shop=${shop} customerId=${normalizeCustomerId(cred.customerId)} prevLogin=${queryParams.loginCustomerId} nextLogin=${retriedLogin}`,
        );
        if (retriedLogin !== queryParams.loginCustomerId) {
          queryParams.loginCustomerId = retriedLogin;
          await setGoogleAdsCredential(shop, {
            accessToken,
            refreshToken: cred.refreshToken,
            customerId: cred.customerId,
            loginCustomerId: retriedLogin,
            loginCustomerIdVerifiedAt: new Date().toISOString(),
          });
          rows = await executeGaqlQuery({ ...queryParams, query: baseQuery });
        } else {
          console.error(`${LOG_PREFIX} step=gaql shop=${shop} ${formatOutboundErrorLog(e)}`);
          throw e;
        }
      } else {
        console.error(`${LOG_PREFIX} step=gaql shop=${shop} ${formatOutboundErrorLog(e)}`);
        throw e;
      }
    }

    const [purchaseMap, atcMap, pageViewMap] = await Promise.all([
      fetchConversionCategoryMap({ ...queryParams, during, category: "PURCHASE" }),
      fetchConversionCategoryMap({ ...queryParams, during, category: "ADD_TO_CART" }),
      fetchConversionCategoryMap({ ...queryParams, during, category: "PAGE_VIEW" }),
    ]);

    const flat = rows
      .map((row) => {
        if (row.customer?.currency_code && !currencyCode) {
          currencyCode = row.customer.currency_code;
        }
        const campaignId = row.campaign?.id ?? "";
        const adGroupId = row.adGroup?.id ?? "";
        const adId = row.adGroupAd?.ad?.id ?? "";
        const costMicros = toNumber(row.metrics?.cost_micros);
        const spend = costMicros / 1_000_000;
        const clicks = toNumber(row.metrics?.clicks);
        const conversions = toNumber(row.metrics?.conversions);
        const conversionsValue = toNumber(row.metrics?.conversions_value);
        const key = convMapKey(campaignId, adGroupId, adId);
        const purchase = purchaseMap.get(key);
        const atc = atcMap.get(key);
        const pageView = pageViewMap.get(key);
        const averageCpmMicros = toNumber(row.metrics?.average_cpm);

        return {
          campaignId,
          campaignName: row.campaign?.name ?? campaignId,
          campaignStatus: row.campaign?.status ?? "UNKNOWN",
          adSetId: adGroupId,
          adSetName: row.adGroup?.name ?? adGroupId,
          adSetStatus: row.adGroup?.status ?? "UNKNOWN",
          adId,
          adName: row.adGroupAd?.ad?.name ?? adId,
          adStatus: row.adGroupAd?.status ?? "UNKNOWN",
          metrics: finalizeMetrics({
            impressions: toNumber(row.metrics?.impressions),
            clicks,
            spend,
            ctr: toNumber(row.metrics?.ctr),
            cpc: toNumber(row.metrics?.average_cpc) / 1_000_000,
            cpm: averageCpmMicros > 0 ? averageCpmMicros / 1_000_000 : null,
            conversions,
            conversionsValue,
            purchases: purchase ? purchase.conversions : null,
            purchaseValue: purchase ? purchase.value : null,
            addToCart: atc ? atc.conversions : null,
            landingPageViews: pageView ? pageView.conversions : null,
            allConversions:
              row.metrics?.all_conversions !== undefined
                ? toNumber(row.metrics.all_conversions)
                : null,
            reach: null,
            frequency: null,
          }),
        };
      })
      .filter((r) => r.campaignId && r.adSetId && r.adId);

    campaigns = nestFlatAdRows(flat);
  }

  const [keywords, searchTerms, creatives] = await Promise.all([
    wantKeywords ? fetchKeywords({ ...queryParams, during }) : Promise.resolve([]),
    wantSearchTerms ? fetchSearchTerms({ ...queryParams, during }) : Promise.resolve([]),
    wantCreatives ? fetchCreatives({ ...queryParams, during }) : Promise.resolve([]),
  ]);

  return {
    platform: "google",
    accountId: cred.customerId,
    currencyCode,
    rangeDays,
    dateStart,
    dateEnd,
    campaigns,
    keywords,
    searchTerms,
    creatives,
  };
}
