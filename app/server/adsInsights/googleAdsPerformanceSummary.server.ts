/**
 * Google Pixel 页用的轻量账户日汇总：Catalog Google Ads 凭证 + GAQL customer 日粒度。
 * 不拉取广告树，避免与完整 Ads Insights 重复请求成本。
 */

import { prepareGoogleAdsApiAuth } from "../adsCatalog/googleAdsToken.server";
import { getGoogleAdsDeveloperToken } from "../adsCatalog/googleOAuth.server";
import {
  buildGoogleAdsHeaders,
  formatGoogleAdsUserError,
  googleAdsApiUrl,
  normalizeCustomerId,
  parseGoogleAdsError,
} from "../adsCatalog/googleAdsApi.server";
import {
  formatOutboundErrorLog,
  formatOutboundNetworkError,
} from "../common/outboundError.server";
import { googleDuringClause, resolveDateWindow } from "./dateRange.server";
import { finalizeMetrics, toNumber, type AdsInsightsRangeDays } from "./types.server";

const LOG_PREFIX = "[AdsInsights][GoogleSummary]";

export type GoogleAdsPerformanceDay = {
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversionsValue: number;
  purchases: number;
  purchaseValue: number;
};

export type GoogleAdsPerformanceSummary = {
  accountId: string;
  currencyCode: string | null;
  rangeDays: AdsInsightsRangeDays;
  dateStart: string;
  dateEnd: string;
  totals: {
    impressions: number;
    clicks: number;
    spend: number;
    conversions: number;
    conversionsValue: number;
    purchases: number;
    purchaseValue: number;
    ctr: number;
    cpc: number;
    conversionRate: number;
    roas: number | null;
  };
  days: GoogleAdsPerformanceDay[];
};

type GaqlRow = {
  customer?: { currency_code?: string };
  segments?: { date?: string; conversion_action_category?: string };
  metrics?: Record<string, string | number | undefined>;
};

type SearchStreamResponse = { results?: GaqlRow[] };

function emptyDay(date: string): GoogleAdsPerformanceDay {
  return {
    date,
    impressions: 0,
    clicks: 0,
    spend: 0,
    conversions: 0,
    conversionsValue: 0,
    purchases: 0,
    purchaseValue: 0,
  };
}

/** 按 UTC 日历日填充缺失日期为零值行。 */
export function fillDailySeries(
  rangeDays: AdsInsightsRangeDays,
  sparse: Map<string, GoogleAdsPerformanceDay>,
  now = new Date(),
): { days: GoogleAdsPerformanceDay[]; dateStart: string; dateEnd: string } {
  const { dateStart, dateEnd } = resolveDateWindow(rangeDays, now);
  const days: GoogleAdsPerformanceDay[] = [];
  const cursor = new Date(`${dateStart}T00:00:00.000Z`);
  const end = new Date(`${dateEnd}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    const key = cursor.toISOString().slice(0, 10);
    days.push(sparse.get(key) ?? emptyDay(key));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { days, dateStart, dateEnd };
}

export function aggregatePerformanceDays(days: GoogleAdsPerformanceDay[]) {
  const impressions = days.reduce((sum, d) => sum + d.impressions, 0);
  const clicks = days.reduce((sum, d) => sum + d.clicks, 0);
  const spend = days.reduce((sum, d) => sum + d.spend, 0);
  const conversions = days.reduce((sum, d) => sum + d.conversions, 0);
  const conversionsValue = days.reduce((sum, d) => sum + d.conversionsValue, 0);
  const purchases = days.reduce((sum, d) => sum + d.purchases, 0);
  const purchaseValue = days.reduce((sum, d) => sum + d.purchaseValue, 0);
  const metrics = finalizeMetrics({
    impressions,
    clicks,
    spend,
    conversions,
    conversionsValue,
  });
  return {
    impressions: metrics.impressions,
    clicks: metrics.clicks,
    spend: metrics.spend,
    conversions: metrics.conversions,
    conversionsValue: metrics.conversionsValue,
    purchases,
    purchaseValue,
    ctr: metrics.ctr,
    cpc: metrics.cpc,
    conversionRate: metrics.conversionRate,
    roas: metrics.roas,
  };
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

/**
 * 拉取 Catalog 绑定账户的日粒度成效摘要。
 * 未绑定 Ads / 缺少 developer token 时返回 null。
 */
export async function fetchGoogleAdsPerformanceSummary(
  shop: string,
  rangeDays: AdsInsightsRangeDays,
): Promise<GoogleAdsPerformanceSummary | null> {
  const developerToken = getGoogleAdsDeveloperToken();
  if (!developerToken) return null;

  let auth: Awaited<ReturnType<typeof prepareGoogleAdsApiAuth>>;
  try {
    auth = await prepareGoogleAdsApiAuth(shop);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("未连接") || message.includes("未配置")) {
      return null;
    }
    throw e;
  }

  const during = googleDuringClause(rangeDays);
  const queryParams = {
    accessToken: auth.accessToken,
    developerToken,
    customerId: auth.customerId,
    loginCustomerId: auth.loginCustomerId,
  };

  const baseQuery = `
    SELECT
      segments.date,
      customer.currency_code,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM customer
    WHERE segments.date DURING ${during}
    ORDER BY segments.date
  `;

  const purchaseQuery = `
    SELECT
      segments.date,
      metrics.conversions,
      metrics.conversions_value,
      segments.conversion_action_category
    FROM customer
    WHERE segments.date DURING ${during}
      AND segments.conversion_action_category = 'PURCHASE'
    ORDER BY segments.date
  `;

  let baseRows: GaqlRow[];
  try {
    baseRows = await executeGaqlQuery({ ...queryParams, query: baseQuery });
  } catch (e) {
    console.error(`${LOG_PREFIX} step=base_gaql shop=${shop} ${formatOutboundErrorLog(e)}`);
    throw e;
  }

  let purchaseRows: GaqlRow[] = [];
  try {
    purchaseRows = await executeGaqlQuery({ ...queryParams, query: purchaseQuery });
  } catch (e) {
    console.warn(`${LOG_PREFIX} step=purchase_gaql shop=${shop} ${formatOutboundErrorLog(e)}`);
  }

  const sparse = new Map<string, GoogleAdsPerformanceDay>();
  let currencyCode: string | null = null;

  for (const row of baseRows) {
    const date = row.segments?.date?.trim();
    if (!date) continue;
    if (row.customer?.currency_code && !currencyCode) {
      currencyCode = row.customer.currency_code;
    }
    const prev = sparse.get(date) ?? emptyDay(date);
    sparse.set(date, {
      ...prev,
      impressions: prev.impressions + toNumber(row.metrics?.impressions),
      clicks: prev.clicks + toNumber(row.metrics?.clicks),
      spend: prev.spend + toNumber(row.metrics?.cost_micros) / 1_000_000,
      conversions: prev.conversions + toNumber(row.metrics?.conversions),
      conversionsValue: prev.conversionsValue + toNumber(row.metrics?.conversions_value),
    });
  }

  for (const row of purchaseRows) {
    const date = row.segments?.date?.trim();
    if (!date) continue;
    const prev = sparse.get(date) ?? emptyDay(date);
    sparse.set(date, {
      ...prev,
      purchases: prev.purchases + toNumber(row.metrics?.conversions),
      purchaseValue: prev.purchaseValue + toNumber(row.metrics?.conversions_value),
    });
  }

  const { days, dateStart, dateEnd } = fillDailySeries(rangeDays, sparse);
  return {
    accountId: auth.customerId,
    currencyCode,
    rangeDays,
    dateStart,
    dateEnd,
    totals: aggregatePerformanceDays(days),
    days,
  };
}
