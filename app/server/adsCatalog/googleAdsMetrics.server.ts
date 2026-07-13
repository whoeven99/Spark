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
import {
  getGoogleOAuthClient,
  getGoogleAdsDeveloperToken,
} from "./googleOAuth.server";
import {
  buildGoogleAdsHeaders,
  googleAdsApiUrl,
  normalizeCustomerId,
  parseGoogleAdsError,
  resolveLoginCustomerId,
} from "./googleAdsApi.server";
import { refreshGoogleAccessToken } from "./clients/googleMerchantClient.server";
import {
  formatOutboundErrorLog,
  formatOutboundNetworkError,
} from "../common/outboundError.server";

const LOG_PREFIX = "[AdsCatalog][GoogleAdsMetrics]";

function logMetricsError(
  step: string,
  shop: string,
  error: unknown,
  context?: Record<string, string | undefined>,
): void {
  const ctx = Object.entries(context ?? {})
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  const suffix = ctx ? ` ${ctx}` : "";
  console.error(`${LOG_PREFIX} step=${step} shop=${shop}${suffix} ${formatOutboundErrorLog(error)}`);
  if (error instanceof Error && error.stack) {
    console.error(`${LOG_PREFIX} step=${step} shop=${shop} stack=${error.stack}`);
  }
}

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
    console.error(
      `${LOG_PREFIX} step=gaql_fetch customerId=${cleanId} loginCustomerId=${params.loginCustomerId} url=${url} ${formatOutboundErrorLog(e)}`,
    );
    throw new Error(`Google Ads API 网络请求失败: ${formatOutboundNetworkError(e)}`, {
      cause: e,
    });
  }

  const text = await response.text();
  if (!response.ok) {
    const msg = parseGoogleAdsError(text, response.status);
    console.error(
      `${LOG_PREFIX} step=gaql_http customerId=${cleanId} loginCustomerId=${params.loginCustomerId} status=${response.status} body=${text.slice(0, 500)}`,
    );
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
  if (!clientId || !clientSecret) {
    console.warn(
      `${LOG_PREFIX} step=refresh_token shop=${shop} skipped=missing_oauth_client using_stored_access_token`,
    );
    return cred.accessToken;
  }

  const refreshed = await refreshGoogleAccessToken({
    clientId,
    clientSecret,
    refreshToken: cred.refreshToken,
  });
  if (!refreshed) {
    console.warn(
      `${LOG_PREFIX} step=refresh_token shop=${shop} customerId=${cred.customerId} result=failed using_stored_access_token`,
    );
    return cred.accessToken;
  }

  await setGoogleAdsCredential(shop, {
    accessToken: refreshed.accessToken,
    refreshToken: cred.refreshToken,
    customerId: cred.customerId,
    loginCustomerId: cred.loginCustomerId,
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
  console.info(`${LOG_PREFIX} step=start shop=${shop}`);

  const developerToken = getGoogleAdsDeveloperToken();
  if (!developerToken) {
    console.warn(`${LOG_PREFIX} step=config shop=${shop} missing=GOOGLE_ADS_DEVELOPER_TOKEN`);
    return null;
  }

  let cred;
  try {
    cred = await getGoogleAdsCredential(shop);
  } catch (e) {
    logMetricsError("load_credential", shop, e);
    throw e;
  }
  if (!cred) {
    console.info(`${LOG_PREFIX} step=load_credential shop=${shop} result=not_bound`);
    return null;
  }

  console.info(
    `${LOG_PREFIX} step=load_credential shop=${shop} customerId=${cred.customerId} hasLoginCustomerId=${Boolean(cred.loginCustomerId)} hasRefreshToken=${Boolean(cred.refreshToken)}`,
  );

  const accessToken = await maybeRefreshAdsToken(shop) ?? cred.accessToken;
  const customerId = cred.customerId;

  let loginCustomerId =
    cred.loginCustomerId?.trim() || normalizeCustomerId(customerId);
  if (!cred.loginCustomerId) {
    console.info(
      `${LOG_PREFIX} step=resolve_login_customer_id shop=${shop} customerId=${customerId} reason=missing_stored_login_customer_id`,
    );
    try {
      loginCustomerId = await resolveLoginCustomerId({
        accessToken,
        developerToken,
        customerId,
      });
    } catch (e) {
      logMetricsError("resolve_login_customer_id", shop, e, { customerId });
      throw e;
    }
    console.info(
      `${LOG_PREFIX} step=resolve_login_customer_id shop=${shop} customerId=${customerId} loginCustomerId=${loginCustomerId}`,
    );
    try {
      await setGoogleAdsCredential(shop, {
        accessToken,
        refreshToken: cred.refreshToken,
        customerId,
        loginCustomerId,
      });
    } catch (e) {
      logMetricsError("persist_login_customer_id", shop, e, {
        customerId,
        loginCustomerId,
      });
      throw e;
    }
  }

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
    console.info(
      `${LOG_PREFIX} step=gaql_query shop=${shop} customerId=${customerId} loginCustomerId=${loginCustomerId}`,
    );
    rows = await executeGaqlQuery({
      accessToken,
      developerToken,
      customerId,
      loginCustomerId,
      query,
    });
  } catch (e) {
    logMetricsError("gaql_query", shop, e, { customerId, loginCustomerId });
    throw e;
  }

  console.info(
    `${LOG_PREFIX} step=done shop=${shop} customerId=${customerId} campaignCount=${rows.length}`,
  );

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
