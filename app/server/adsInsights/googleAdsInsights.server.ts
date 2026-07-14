/**
 * Google Ads 广告洞察：Ad 级别 GAQL + 转化动作分类补齐购买/加购。
 */

import {
  getGoogleAdsCredential,
  setGoogleAdsCredential,
} from "../adsCatalog/credentialStore.server";
import {
  getGoogleAdsDeveloperToken,
  getGoogleOAuthClient,
} from "../adsCatalog/googleOAuth.server";
import {
  buildGoogleAdsHeaders,
  googleAdsApiUrl,
  normalizeCustomerId,
  parseGoogleAdsError,
  resolveLoginCustomerId,
} from "../adsCatalog/googleAdsApi.server";
import { refreshGoogleAccessToken } from "../adsCatalog/clients/googleMerchantClient.server";
import {
  formatOutboundErrorLog,
  formatOutboundNetworkError,
} from "../common/outboundError.server";
import { googleDuringClause, resolveDateWindow } from "./dateRange.server";
import { nestFlatAdRows } from "./nest.server";
import {
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
    ad?: { id?: string; name?: string };
  };
  metrics?: Record<string, string | number | undefined>;
  customer?: { currency_code?: string };
  segments?: { conversion_action_category?: string };
}

interface SearchStreamResponse {
  results?: GaqlRow[];
}

async function executeGaqlQuery(params: {
  accessToken: string;
  developerToken: string;
  customerId: string;
  loginCustomerId: string;
  query: string;
}): Promise<GaqlRow[]> {
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
    throw new Error(`Google Ads API 错误: ${parseGoogleAdsError(text, response.status)}`);
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

async function maybeRefreshAdsToken(shop: string): Promise<string | null> {
  const cred = await getGoogleAdsCredential(shop);
  if (!cred?.refreshToken) return cred?.accessToken ?? null;

  const { clientId, clientSecret } = getGoogleOAuthClient();
  if (!clientId || !clientSecret) return cred.accessToken;

  const refreshed = await refreshGoogleAccessToken({
    clientId,
    clientSecret,
    refreshToken: cred.refreshToken,
  });
  if (!refreshed) return cred.accessToken;

  await setGoogleAdsCredential(shop, {
    accessToken: refreshed.accessToken,
    refreshToken: cred.refreshToken,
    customerId: cred.customerId,
    loginCustomerId: cred.loginCustomerId,
  });
  return refreshed.accessToken;
}

type ConvKey = string; // campaignId|adGroupId|adId

function convMapKey(campaignId: string, adGroupId: string, adId: string): ConvKey {
  return `${campaignId}|${adGroupId}|${adId}`;
}

async function fetchConversionCategoryMap(params: {
  accessToken: string;
  developerToken: string;
  customerId: string;
  loginCustomerId: string;
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
    LIMIT 2000
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

export async function fetchGoogleAdsInsights(
  shop: string,
  rangeDays: AdsInsightsRangeDays,
): Promise<AdsInsightsResult | null> {
  const developerToken = getGoogleAdsDeveloperToken();
  if (!developerToken) return null;

  const cred = await getGoogleAdsCredential(shop);
  if (!cred) return null;

  const { dateStart, dateEnd } = resolveDateWindow(rangeDays);
  const during = googleDuringClause(rangeDays);
  const accessToken = (await maybeRefreshAdsToken(shop)) ?? cred.accessToken;
  let loginCustomerId = cred.loginCustomerId?.trim() || normalizeCustomerId(cred.customerId);

  if (!cred.loginCustomerId) {
    loginCustomerId = await resolveLoginCustomerId({
      accessToken,
      developerToken,
      customerId: cred.customerId,
    });
    await setGoogleAdsCredential(shop, {
      accessToken,
      refreshToken: cred.refreshToken,
      customerId: cred.customerId,
      loginCustomerId,
    });
  }

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
      metrics.conversions,
      metrics.conversions_value
    FROM ad_group_ad
    WHERE segments.date DURING ${during}
      AND campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
      AND ad_group_ad.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 1000
  `;

  const queryParams = {
    accessToken,
    developerToken,
    customerId: cred.customerId,
    loginCustomerId,
  };

  let rows: GaqlRow[];
  try {
    rows = await executeGaqlQuery({ ...queryParams, query: baseQuery });
  } catch (e) {
    console.error(`${LOG_PREFIX} step=gaql shop=${shop} ${formatOutboundErrorLog(e)}`);
    throw e;
  }

  const [purchaseMap, atcMap, pageViewMap] = await Promise.all([
    fetchConversionCategoryMap({ ...queryParams, during, category: "PURCHASE" }),
    fetchConversionCategoryMap({ ...queryParams, during, category: "ADD_TO_CART" }),
    fetchConversionCategoryMap({ ...queryParams, during, category: "PAGE_VIEW" }),
  ]);

  let currencyCode: string | null = null;
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
          conversions,
          conversionsValue,
          purchases: purchase ? purchase.conversions : null,
          purchaseValue: purchase ? purchase.value : null,
          addToCart: atc ? atc.conversions : null,
          landingPageViews: pageView ? pageView.conversions : null,
          reach: null,
          frequency: null,
        }),
      };
    })
    .filter((r) => r.campaignId && r.adSetId && r.adId);

  return {
    platform: "google",
    accountId: cred.customerId,
    currencyCode,
    rangeDays,
    dateStart,
    dateEnd,
    campaigns: nestFlatAdRows(flat),
  };
}
