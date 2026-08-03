/**
 * Meta Marketing API 沙盒：与正式 Catalog / Meta Ads OAuth 完全隔离。
 * 凭证仅来自环境变量，绝不读取 AdPlatformCredential。
 */

import { META_GRAPH_BASE } from "../adsCatalog/metaOAuth.server";
import {
  formatOutboundErrorLog,
  formatOutboundNetworkError,
} from "../common/outboundError.server";
import { fetchMetaAdsInsightsWithCredential } from "./metaAdsInsights.server";
import type { AdsInsightsRangeDays, AdsInsightsResult } from "./types.server";

const LOG_PREFIX = "[AdsInsights][Meta][Sandbox]";

export type MetaSandboxCredentials = {
  accessToken: string;
  adAccountId: string;
  accountName: string | null;
  pageId: string | null;
  currencyCode: string | null;
};

export type MetaSandboxSeedResult = {
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  campaignName: string;
  warnings: string[];
};

type MetaApiError = {
  message?: string;
  error_user_title?: string;
  error_user_msg?: string;
};

function readEnv(name: string): string {
  return (process.env[name] || "").trim();
}

/** 沙盒凭证是否已配置（不暴露 token）。 */
export function isMetaSandboxConfigured(): boolean {
  return Boolean(readEnv("META_SANDBOX_ACCESS_TOKEN") && readEnv("META_SANDBOX_AD_ACCOUNT_ID"));
}

/** 读取沙盒环境变量；未配置时返回 null。 */
export function getMetaSandboxCredentials(): MetaSandboxCredentials | null {
  const accessToken = readEnv("META_SANDBOX_ACCESS_TOKEN");
  const adAccountId = readEnv("META_SANDBOX_AD_ACCOUNT_ID");
  if (!accessToken || !adAccountId) return null;
  return {
    accessToken,
    adAccountId,
    accountName: readEnv("META_SANDBOX_ACCOUNT_NAME") || null,
    pageId: readEnv("META_SANDBOX_PAGE_ID") || null,
    currencyCode: readEnv("META_SANDBOX_CURRENCY_CODE") || null,
  };
}

function normalizeAdAccountId(id: string): string {
  const stripped = id.replace(/^act_/, "");
  return `act_${stripped}`;
}

function encodeMetaBody(accessToken: string, body: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  params.set("access_token", accessToken);
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "object") {
      params.set(key, JSON.stringify(value));
    } else {
      params.set(key, String(value));
    }
  }
  return params;
}

function formatMetaError(error: MetaApiError | undefined, fallback: string): string {
  if (!error) return fallback;
  const parts = [error.error_user_title, error.error_user_msg, error.message].filter(Boolean);
  return [...new Set(parts)].join(" — ") || fallback;
}

async function metaPost<T = Record<string, unknown>>(
  path: string,
  accessToken: string,
  body: Record<string, unknown>,
  step: string,
): Promise<T> {
  const url = `${META_GRAPH_BASE}/${path.replace(/^\//, "")}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: encodeMetaBody(accessToken, body),
    });
  } catch (e) {
    throw new Error(`[${step}] Meta Graph 网络请求失败: ${formatOutboundNetworkError(e)}`, {
      cause: e,
    });
  }
  const text = await response.text();
  let json: { error?: MetaApiError } & Record<string, unknown>;
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    throw new Error(`[${step}] Meta API HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  if (!response.ok || json.error) {
    throw new Error(
      `[${step}] ${formatMetaError(json.error, `Meta API HTTP ${response.status}`)}`,
    );
  }
  return json as T;
}

async function metaGet<T>(path: string, accessToken: string, query?: Record<string, string>): Promise<T> {
  const url = new URL(`${META_GRAPH_BASE}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", accessToken);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }
  let response: Response;
  try {
    response = await fetch(url.toString());
  } catch (e) {
    throw new Error(`Meta Graph 网络请求失败: ${formatOutboundNetworkError(e)}`, { cause: e });
  }
  const json = (await response.json().catch(() => ({}))) as { error?: MetaApiError } & T;
  if (!response.ok || json.error) {
    throw new Error(formatMetaError(json.error, `Meta API HTTP ${response.status}`));
  }
  return json;
}

async function resolveSandboxCurrencyCode(params: {
  accessToken: string;
  adAccountId: string;
  fallback?: string | null;
}): Promise<string | null> {
  if (params.fallback) return params.fallback;
  try {
    const accountId = normalizeAdAccountId(params.adAccountId);
    const json = await metaGet<{ currency?: string }>(accountId, params.accessToken, {
      fields: "currency",
    });
    return json.currency?.trim() || null;
  } catch (e) {
    console.warn(`${LOG_PREFIX} currency lookup failed ${formatOutboundErrorLog(e)}`);
    return null;
  }
}

async function resolveSandboxPageId(params: {
  accessToken: string;
  pageId?: string | null;
}): Promise<string | null> {
  if (params.pageId) return params.pageId;
  try {
    const json = await metaGet<{ data?: Array<{ id?: string }> }>(
      "me/accounts",
      params.accessToken,
      { fields: "id,name", limit: "1" },
    );
    const pageId = json.data?.[0]?.id?.trim();
    return pageId || null;
  } catch (e) {
    console.warn(`${LOG_PREFIX} page lookup failed ${formatOutboundErrorLog(e)}`);
    return null;
  }
}

export async function fetchMetaSandboxInsights(
  rangeDays: AdsInsightsRangeDays,
  options?: { includeCreatives?: boolean },
): Promise<AdsInsightsResult | null> {
  const creds = getMetaSandboxCredentials();
  if (!creds) return null;

  const currencyCode = await resolveSandboxCurrencyCode({
    accessToken: creds.accessToken,
    adAccountId: creds.adAccountId,
    fallback: creds.currencyCode,
  });

  return fetchMetaAdsInsightsWithCredential({
    accessToken: creds.accessToken,
    adAccountId: creds.adAccountId,
    currencyCode,
    accountName: creds.accountName,
    rangeDays,
    options,
    sandbox: true,
  });
}

/**
 * 在 Meta 沙盒广告账户创建测试结构：Campaign → Ad Set → Ad Creative → Ad（PAUSED）。
 * 需要 META_SANDBOX_PAGE_ID，或 token 可访问的 Facebook Page。
 */
export async function seedMetaSandboxMinimalStructure(): Promise<MetaSandboxSeedResult> {
  const creds = getMetaSandboxCredentials();
  if (!creds) {
    throw new Error(
      "未配置 Meta 沙盒：请设置 META_SANDBOX_ACCESS_TOKEN 与 META_SANDBOX_AD_ACCOUNT_ID",
    );
  }

  const pageId = await resolveSandboxPageId({
    accessToken: creds.accessToken,
    pageId: creds.pageId,
  });
  if (!pageId) {
    throw new Error(
      "未找到可用于创建广告的 Facebook Page：请设置 META_SANDBOX_PAGE_ID，或确保 token 可访问至少一个 Page",
    );
  }

  const stamp = Date.now().toString(36);
  const campaignName = `Spark Meta Sandbox Campaign ${stamp}`;
  const adSetName = `Spark Meta Sandbox AdSet ${stamp}`;
  const adName = `Spark Meta Sandbox Ad ${stamp}`;
  const warnings: string[] = [];
  const accountPath = normalizeAdAccountId(creds.adAccountId);
  const linkUrl = readEnv("META_SANDBOX_SEED_LINK_URL") || "https://example.com";

  const campaignResp = await metaPost<{ id: string }>(
    `${accountPath}/campaigns`,
    creds.accessToken,
    {
      name: campaignName,
      objective: "OUTCOME_TRAFFIC",
      status: "PAUSED",
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: false,
    },
    "创建沙盒广告系列",
  );
  const campaignId = campaignResp.id;

  const adSetBody: Record<string, unknown> = {
    name: adSetName,
    campaign_id: campaignId,
    billing_event: "IMPRESSIONS",
    optimization_goal: "LINK_CLICKS",
    destination_type: "WEBSITE",
    targeting: {
      geo_locations: { countries: ["US"] },
      age_min: 18,
      age_max: 65,
      targeting_automation: { advantage_audience: 0 },
    },
    status: "PAUSED",
    start_time: new Date().toISOString(),
    bid_strategy: "LOWEST_COST_WITH_BID_CAP",
    bid_amount: 100,
    daily_budget: 500,
  };

  const adSetResp = await metaPost<{ id: string }>(
    `${accountPath}/adsets`,
    creds.accessToken,
    adSetBody,
    "创建沙盒广告组",
  );
  const adSetId = adSetResp.id;

  const creativeResp = await metaPost<{ id: string }>(
    `${accountPath}/adcreatives`,
    creds.accessToken,
    {
      name: `${adName}_creative`,
      object_story_spec: {
        page_id: pageId,
        link_data: {
          message: "Spark Meta sandbox test",
          link: linkUrl,
          name: adName,
          call_to_action: { type: "LEARN_MORE", value: { link: linkUrl } },
        },
      },
    },
    "创建沙盒广告创意",
  );
  const creativeId = creativeResp.id;

  const adResp = await metaPost<{ id: string }>(
    `${accountPath}/ads`,
    creds.accessToken,
    {
      name: adName,
      adset_id: adSetId,
      creative: { creative_id: creativeId },
      status: "PAUSED",
    },
    "创建沙盒广告",
  );

  return {
    campaignId,
    adSetId,
    adId: adResp.id,
    campaignName,
    warnings,
  };
}
