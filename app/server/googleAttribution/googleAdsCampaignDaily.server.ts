/**
 * Google Ads campaign 级成效（日期范围内按 campaign 聚合）。
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
import { googleDuringClause } from "../adsInsights/dateRange.server";
import { toNumber, type AdsInsightsRangeDays } from "../adsInsights/types.server";
import type { AdsCampaignMetrics } from "./joinCampaignMetrics.server";

const LOG_PREFIX = "[GoogleAttribution][AdsCampaign]";

type GaqlRow = {
  campaign?: { id?: string; name?: string };
  customer?: { currency_code?: string };
  metrics?: Record<string, string | number | undefined>;
};

type SearchStreamResponse = { results?: GaqlRow[] };

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
  return batches.flatMap((batch) => batch.results ?? []);
}

export type GoogleAdsCampaignSummary = {
  accountId: string;
  currencyCode: string | null;
  campaigns: AdsCampaignMetrics[];
};

export async function fetchGoogleAdsCampaignSummary(
  shop: string,
  rangeDays: AdsInsightsRangeDays,
): Promise<GoogleAdsCampaignSummary | null> {
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
    console.error(`${LOG_PREFIX} shop=${shop} auth=${formatOutboundErrorLog(e)}`);
    return null;
  }

  const during = googleDuringClause(rangeDays);
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      customer.currency_code,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date DURING ${during}
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `;

  let rows: GaqlRow[];
  try {
    rows = await executeGaqlQuery({
      accessToken: auth.accessToken,
      developerToken,
      customerId: auth.customerId,
      loginCustomerId: auth.loginCustomerId,
      query,
    });
  } catch (e) {
    console.error(`${LOG_PREFIX} shop=${shop} ${formatOutboundErrorLog(e)}`);
    return null;
  }

  let currencyCode: string | null = null;
  const campaigns: AdsCampaignMetrics[] = [];

  for (const row of rows) {
    const campaignId = String(row.campaign?.id ?? "").trim();
    const campaignName = row.campaign?.name?.trim() || campaignId;
    if (!campaignId) continue;
    if (row.customer?.currency_code && !currencyCode) {
      currencyCode = row.customer.currency_code;
    }
    campaigns.push({
      campaignId,
      campaignName,
      impressions: toNumber(row.metrics?.impressions),
      clicks: toNumber(row.metrics?.clicks),
      spend: toNumber(row.metrics?.cost_micros) / 1_000_000,
      conversions: toNumber(row.metrics?.conversions),
      conversionValue: toNumber(row.metrics?.conversions_value),
    });
  }

  return {
    accountId: auth.customerId,
    currencyCode,
    campaigns,
  };
}
