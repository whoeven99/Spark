/**
 * Google Ads 广告计划数据指标查询服务
 *
 * 使用 Google Ads GAQL 查询 campaign 级别的过去 7 天投放指标。
 * 支持 access token 自动刷新（需要 refreshToken + app-level OAuth 凭证）。
 */

import {
  getGoogleAdsCredential,
  setGoogleAdsCredential,
} from "./credentialStore.server";
import { getGoogleOAuthClient, getGoogleAdsDeveloperToken } from "./googleOAuth.server";
import { refreshGoogleAccessToken } from "./clients/googleMerchantClient.server";
import { formatOutboundNetworkError } from "../common/outboundError.server";

const GOOGLE_ADS_API_VERSION = "v17";
const LOG_PREFIX = "[AdsCatalog][GoogleAdsMetrics]";

export interface GoogleAdsCampaignMetrics {
  campaignId: string;
  campaignName: string;
  /** ENABLED / PAUSED / REMOVED */
  campaignStatus: string;
  impressions: number;
  clicks: number;
  /** 总花费，单位：账户币种（原始为 micros / 1_000_000） */
  costMicros: number;
  costAmount: number;
  ctr: number;
  /** 平均 CPC，单位同 costAmount */
  averageCpc: number;
  conversions: number;
  conversionsValue: number;
  conversionRate: number;
}

export interface GoogleAdsMetricsResult {
  customerId: string;
  dateRange: "LAST_7_DAYS";
  campaigns: GoogleAdsCampaignMetrics[];
  currencyCode: string | null;
}

interface GaqlRow {
  campaign?: {
    id?: string;
    name?: string;
    status?: string;
  };
  metrics?: {
    impressions?: string | number;
    clicks?: string | number;
    cost_micros?: string | number;
    ctr?: string | number;
    average_cpc?: string | number;
    conversions?: string | number;
    conversions_value?: string | number;
  };
  customer?: {
    currency_code?: string;
  };
}

interface SearchStreamResponse {
  results?: GaqlRow[];
  fieldMask?: string;
  requestId?: string;
}

function toNumber(v: string | number | undefined): number {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

async function executeGaqlQuery(params: {
  accessToken: string;
  developerToken: string;
  customerId: string;
  query: string;
}): Promise<GaqlRow[]> {
  const cleanId = params.customerId.replace(/\D/g, "");
  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanId}/googleAds:searchStream`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "developer-token": params.developerToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: params.query }),
    });
  } catch (e) {
    throw new Error(`Google Ads API 网络请求失败: ${formatOutboundNetworkError(e)}`);
  }

  const text = await response.text();
  if (!response.ok) {
    let msg = `HTTP ${response.status}`;
    try {
      const err = JSON.parse(text) as {
        error?: { message?: string; details?: Array<{ errors?: Array<{ message?: string }> }> };
      };
      msg = err.error?.message ?? msg;
    } catch {
      // ignore parse error
    }
    throw new Error(`Google Ads API 错误: ${msg}`);
  }

  // searchStream 返回 JSON 数组，每个元素是一个 batch
  let batches: SearchStreamResponse[] = [];
  try {
    const parsed = JSON.parse(text) as SearchStreamResponse | SearchStreamResponse[];
    batches = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    throw new Error("Google Ads API 返回了无效的 JSON 数据");
  }

  return batches.flatMap((b) => b.results ?? []);
}

/**
 * 刷新 Google Ads 的 access token。
 * 复用 GMC 的 OAuth token endpoint，仅需 refreshToken + app-level client 凭证。
 */
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
  });

  return refreshed.accessToken;
}

/**
 * 获取该店铺关联 Google Ads 账户过去 7 天的广告系列指标。
 *
 * @returns null 表示未配置凭证或缺少 developer token
 */
export async function fetchGoogleAdsMetrics(
  shop: string,
): Promise<GoogleAdsMetricsResult | null> {
  const developerToken = getGoogleAdsDeveloperToken();
  if (!developerToken) {
    console.warn(`${LOG_PREFIX} 缺少 GOOGLE_ADS_DEVELOPER_TOKEN，跳过指标查询`);
    return null;
  }

  const cred = await getGoogleAdsCredential(shop);
  if (!cred) {
    console.info(`${LOG_PREFIX} 店铺 ${shop} 未绑定 Google Ads 账户`);
    return null;
  }

  const accessToken = await maybeRefreshAdsToken(shop) ?? cred.accessToken;
  const customerId = cred.customerId;

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      customer.currency_code,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date DURING LAST_7_DAYS
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 50
  `;

  let rows: GaqlRow[];
  try {
    rows = await executeGaqlQuery({ accessToken, developerToken, customerId, query });
  } catch (e) {
    console.error(`${LOG_PREFIX} GAQL 查询失败:`, e);
    throw e;
  }

  let currencyCode: string | null = null;
  const campaigns: GoogleAdsCampaignMetrics[] = rows.map((row) => {
    if (row.customer?.currency_code && !currencyCode) {
      currencyCode = row.customer.currency_code;
    }
    const costMicros = toNumber(row.metrics?.cost_micros);
    const costAmount = costMicros / 1_000_000;
    const clicks = toNumber(row.metrics?.clicks);
    const conversions = toNumber(row.metrics?.conversions);
    const impressions = toNumber(row.metrics?.impressions);
    const conversionRate = clicks > 0 ? conversions / clicks : 0;
    const averageCpc = toNumber(row.metrics?.average_cpc) / 1_000_000;

    return {
      campaignId: row.campaign?.id ?? "",
      campaignName: row.campaign?.name ?? "（未知广告系列）",
      campaignStatus: row.campaign?.status ?? "UNKNOWN",
      impressions,
      clicks,
      costMicros,
      costAmount,
      ctr: toNumber(row.metrics?.ctr),
      averageCpc,
      conversions,
      conversionsValue: toNumber(row.metrics?.conversions_value),
      conversionRate,
    };
  });

  return { customerId, dateRange: "LAST_7_DAYS", campaigns, currencyCode };
}
