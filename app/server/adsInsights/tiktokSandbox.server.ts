/**
 * TikTok Marketing API 沙盒：与正式 Catalog OAuth / business-api 完全隔离。
 * 凭证仅来自环境变量，绝不读取 AdPlatformCredential。
 *
 * Seed 建 Campaign → AdGroup（v1.3，需 identity）→ Ad（v1.2 workaround，仍传 identity）；
 * Insights 指标由本地 mock 注入（沙盒无真实投放）。
 */

import type { AdsInsightsCampaign, AdsInsightsDeepRow, AdsInsightsMetrics } from "./types.server";
import { finalizeMetrics } from "./types.server";
import { mergeMetrics } from "./nest.server";
import { formatOutboundErrorLog, formatOutboundNetworkError } from "../common/outboundError.server";

export const TIKTOK_SANDBOX_API_BASE = "https://sandbox-ads.tiktok.com/open_api/v1.3";
/** 沙盒 ad/create 降级至 v1.2（沙盒仍要求 identity；CUSTOMIZED_USER 在 v1.2/v1.3 均被拒）。 */
export const TIKTOK_SANDBOX_API_BASE_V12 = "https://sandbox-ads.tiktok.com/open_api/v1.2";

const LOG_PREFIX = "[AdsInsights][TikTok][Sandbox]";
/** 沙盒创意占位图；可用 TIKTOK_SANDBOX_IMAGE_ID 覆盖。 */
const DEFAULT_SANDBOX_IMAGE_ID = "ad-site-i18n-sg/202208095d0d1d72383f815646c5b090";

export type TiktokSandboxCredentials = {
  accessToken: string;
  advertiserId: string;
  accountName: string | null;
  identityId: string | null;
  identityType: string | null;
};

function readEnv(name: string): string {
  return (process.env[name] || "").trim();
}

/** 沙盒凭证是否已配置（不暴露 token）。 */
export function isTiktokSandboxConfigured(): boolean {
  return Boolean(readEnv("TIKTOK_SANDBOX_ACCESS_TOKEN") && readEnv("TIKTOK_SANDBOX_ADVERTISER_ID"));
}

/** identity 是否已配置（seed 建 Ad 必需）。 */
export function isTiktokSandboxIdentityConfigured(): boolean {
  return Boolean(readEnv("TIKTOK_SANDBOX_IDENTITY_ID") && readEnv("TIKTOK_SANDBOX_IDENTITY_TYPE"));
}

/** 读取沙盒环境变量；未配置时返回 null。 */
export function getTiktokSandboxCredentials(): TiktokSandboxCredentials | null {
  const accessToken = readEnv("TIKTOK_SANDBOX_ACCESS_TOKEN");
  const advertiserId = readEnv("TIKTOK_SANDBOX_ADVERTISER_ID");
  if (!accessToken || !advertiserId) return null;
  const accountName = readEnv("TIKTOK_SANDBOX_ACCOUNT_NAME") || null;
  const identityId = readEnv("TIKTOK_SANDBOX_IDENTITY_ID") || null;
  const identityType = readEnv("TIKTOK_SANDBOX_IDENTITY_TYPE") || null;
  return { accessToken, advertiserId, accountName, identityId, identityType };
}

function resolveSandboxImageId(): string {
  return readEnv("TIKTOK_SANDBOX_IMAGE_ID") || DEFAULT_SANDBOX_IMAGE_ID;
}

type TiktokApiJson<T> = T & { code?: number; message?: string; request_id?: string };

export async function tiktokSandboxRequest<T>(params: {
  method?: "GET" | "POST";
  path: string;
  accessToken: string;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  apiBase?: string;
}): Promise<T> {
  const apiBase = params.apiBase ?? TIKTOK_SANDBOX_API_BASE;
  const url = new URL(`${apiBase}${params.path}`);
  for (const [key, value] of Object.entries(params.query ?? {})) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: params.method ?? (params.body ? "POST" : "GET"),
      headers: {
        "Access-Token": params.accessToken,
        ...(params.body ? { "Content-Type": "application/json" } : {}),
      },
      body: params.body ? JSON.stringify(params.body) : undefined,
    });
  } catch (e) {
    throw new Error(`TikTok Sandbox 网络请求失败: ${formatOutboundNetworkError(e)}`, { cause: e });
  }

  const json = (await response.json().catch(() => ({}))) as TiktokApiJson<T>;
  if (!response.ok || (json.code !== undefined && json.code !== 0)) {
    const detail = json.message || `HTTP ${response.status}`;
    throw new Error(`TikTok Sandbox ${params.path}: ${detail}`);
  }
  return json;
}

export type TiktokSandboxSeedResult = {
  advertiserId: string;
  campaignId: string | null;
  adgroupId: string | null;
  adId: string | null;
  campaignName: string;
  adgroupName: string;
  adName: string;
  warnings: string[];
};

function formatScheduleStart(): string {
  const d = new Date();
  d.setUTCMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00:00`;
}

function buildAdCreativeV12(params: {
  adName: string;
  imageId: string;
  identityId: string;
  identityType: string;
  displayName: string | null;
}): Record<string, unknown> {
  const creative: Record<string, unknown> = {
    ad_name: params.adName,
    ad_format: "SINGLE_IMAGE",
    identity_id: params.identityId,
    identity_type: params.identityType,
    image_ids: [params.imageId],
    ad_text: "Spark sandbox test",
    call_to_action: "LEARN_MORE",
    landing_page_url: "https://example.com",
  };
  if (params.identityType === "CUSTOMIZED_USER" && params.displayName) {
    creative.display_name = params.displayName;
  }
  return creative;
}

function extractAdId(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const adIds = data.ad_ids;
  if (Array.isArray(adIds) && adIds.length > 0) {
    return String(adIds[0]).trim() || null;
  }
  const creatives = data.creatives;
  if (Array.isArray(creatives) && creatives.length > 0) {
    const first = creatives[0] as Record<string, unknown>;
    const id = first.ad_id ?? first.adId;
    if (id !== undefined) return String(id).trim() || null;
  }
  return null;
}

/** 稳定 hash，同一 id 每次生成相同 mock 指标。 */
function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 按实体 id 生成确定性假指标（仅沙盒 Insights 展示用，不写回 TikTok）。
 */
export function buildTiktokSandboxMockMetrics(seed: string): AdsInsightsMetrics {
  const h = hashSeed(seed || "sandbox");
  const impressions = 800 + (h % 9200);
  const ctrBp = 80 + (h % 320); // 0.80% ~ 4.00%
  const clicks = Math.max(1, Math.round((impressions * ctrBp) / 10000));
  const cpcCents = 25 + (h % 175); // $0.25 ~ $2.00
  const spend = Math.round(clicks * cpcCents) / 100;
  const conversionRateBp = 40 + (h % 160); // 4% ~ 20% of clicks
  const conversions = Math.max(0, Math.round((clicks * conversionRateBp) / 10000));
  const avgOrder = 18 + (h % 72);
  const conversionsValue = Math.round(conversions * avgOrder * 100) / 100;
  const purchases = conversions > 0 ? Math.max(1, Math.round(conversions * 0.7)) : 0;
  const purchaseValue = Math.round(purchases * avgOrder * 100) / 100;
  const addToCart = conversions > 0 ? conversions + (h % 5) : h % 3;
  const landingPageViews = Math.max(clicks, Math.round(clicks * 1.1));
  const reach = Math.max(1, Math.round(impressions * (0.55 + (h % 30) / 100)));
  const frequency = Math.round((impressions / reach) * 100) / 100;
  const videoViews = Math.round(impressions * (0.35 + (h % 25) / 100));
  const thruplay = Math.round(videoViews * (0.2 + (h % 20) / 100));

  return finalizeMetrics({
    impressions,
    clicks,
    spend,
    conversions,
    conversionsValue,
    purchases,
    purchaseValue,
    addToCart,
    landingPageViews,
    reach,
    frequency,
    outboundClicks: clicks,
    videoViews,
    thruplay,
    leads: h % 4,
    viewContent: Math.round(clicks * 0.6),
    initiateCheckout: Math.max(0, Math.round(conversions * 1.2)),
    allConversions: conversions + (h % 3),
  });
}

/**
 * 给结构树注入 mock 指标：有 Ad 则按 Ad mock 后上卷；无 Ad 则按 AdSet mock 后上卷。
 */
export function applyTiktokSandboxMockMetrics(
  campaigns: AdsInsightsCampaign[],
): AdsInsightsCampaign[] {
  return campaigns.map((campaign) => {
    let campaignMetrics = finalizeMetrics({});
    const adSets = campaign.adSets.map((adSet) => {
      if (adSet.ads.length > 0) {
        const ads = adSet.ads.map((ad) => ({
          ...ad,
          metrics: buildTiktokSandboxMockMetrics(`ad:${ad.id}`),
        }));
        let adSetMetrics = finalizeMetrics({});
        for (const ad of ads) {
          adSetMetrics = mergeMetrics(adSetMetrics, ad.metrics);
        }
        campaignMetrics = mergeMetrics(campaignMetrics, adSetMetrics);
        return { ...adSet, ads, metrics: adSetMetrics };
      }

      const adSetMetrics = buildTiktokSandboxMockMetrics(`adgroup:${adSet.id}`);
      campaignMetrics = mergeMetrics(campaignMetrics, adSetMetrics);
      return { ...adSet, metrics: adSetMetrics };
    });

    // 无广告组时直接按系列 mock，保证表里也有数
    if (adSets.length === 0) {
      campaignMetrics = buildTiktokSandboxMockMetrics(`campaign:${campaign.id}`);
    }

    return {
      ...campaign,
      adSets,
      metrics: campaignMetrics,
    };
  });
}

/** 创意视图扁平行注入 mock 指标。 */
export function applyTiktokSandboxMockDeepRows(
  rows: AdsInsightsDeepRow[],
): AdsInsightsDeepRow[] {
  return rows.map((row) => ({
    ...row,
    metrics: buildTiktokSandboxMockMetrics(`creative:${row.id}`),
  }));
}

/**
 * 在沙盒账户创建测试结构：Campaign → AdGroup（v1.3 + identity）→ Ad（v1.2 + identity）。
 */
export async function seedTiktokSandboxMinimalStructure(): Promise<TiktokSandboxSeedResult> {
  const creds = getTiktokSandboxCredentials();
  if (!creds) {
    throw new Error(
      "未配置 TikTok 沙盒：请设置 TIKTOK_SANDBOX_ACCESS_TOKEN 与 TIKTOK_SANDBOX_ADVERTISER_ID",
    );
  }
  if (!creds.identityId || !creds.identityType) {
    throw new Error(
      "未配置 TikTok 沙盒 Identity：请设置 TIKTOK_SANDBOX_IDENTITY_ID 与 TIKTOK_SANDBOX_IDENTITY_TYPE",
    );
  }

  const stamp = Date.now().toString(36);
  const campaignName = `Spark Sandbox Campaign ${stamp}`;
  const adgroupName = `Spark Sandbox AdGroup ${stamp}`;
  const adName = `Spark Sandbox Ad ${stamp}`;
  const warnings: string[] = [];
  const imageId = resolveSandboxImageId();
  const displayName = creds.accountName || "Spark Sandbox";

  const campaignJson = await tiktokSandboxRequest<{ data?: { campaign_id?: string } }>({
    method: "POST",
    path: "/campaign/create/",
    accessToken: creds.accessToken,
    body: {
      advertiser_id: creds.advertiserId,
      campaign_name: campaignName,
      objective_type: "TRAFFIC",
      budget_mode: "BUDGET_MODE_DAY",
      budget: 50,
      operation_status: "DISABLE",
    },
  });
  const campaignId = String(campaignJson.data?.campaign_id ?? "").trim() || null;
  if (!campaignId) {
    throw new Error("TikTok Sandbox campaign/create 未返回 campaign_id");
  }

  let adgroupId: string | null = null;
  try {
    const adgroupBody: Record<string, unknown> = {
      advertiser_id: creds.advertiserId,
      campaign_id: campaignId,
      adgroup_name: adgroupName,
      promotion_type: "WEBSITE",
      placement_type: "PLACEMENT_TYPE_NORMAL",
      placements: ["PLACEMENT_TIKTOK"],
      location_ids: ["6252001"],
      budget_mode: "BUDGET_MODE_DAY",
      budget: 20,
      schedule_type: "SCHEDULE_FROM_NOW",
      schedule_start_time: formatScheduleStart(),
      optimization_goal: "CLICK",
      billing_event: "CPC",
      bid_type: "BID_TYPE_NO_BID",
      pacing: "PACING_MODE_SMOOTH",
      operation_status: "DISABLE",
      identity_id: creds.identityId,
      identity_type: creds.identityType,
    };
    const adgroupJson = await tiktokSandboxRequest<{ data?: { adgroup_id?: string } }>({
      method: "POST",
      path: "/adgroup/create/",
      accessToken: creds.accessToken,
      body: adgroupBody,
    });
    adgroupId = String(adgroupJson.data?.adgroup_id ?? "").trim() || null;
    if (!adgroupId) {
      warnings.push("adgroup/create 未返回 adgroup_id");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warnings.push(`adgroup/create 失败: ${msg}`);
    console.warn(`${LOG_PREFIX} seed adgroup ${formatOutboundErrorLog(e)}`);
  }

  let adId: string | null = null;
  if (adgroupId) {
    try {
      const adJson = await tiktokSandboxRequest<{ data?: Record<string, unknown> }>({
        method: "POST",
        path: "/ad/create/",
        accessToken: creds.accessToken,
        apiBase: TIKTOK_SANDBOX_API_BASE_V12,
        body: {
          advertiser_id: creds.advertiserId,
          adgroup_id: adgroupId,
          creatives: [
            buildAdCreativeV12({
              adName,
              imageId,
              identityId: creds.identityId,
              identityType: creds.identityType,
              displayName,
            }),
          ],
        },
      });
      adId = extractAdId(adJson.data);
      if (!adId) {
        warnings.push("ad/create 未返回 ad_id");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`ad/create 失败: ${msg}`);
      console.warn(`${LOG_PREFIX} seed ad ${formatOutboundErrorLog(e)}`);
    }
  }

  return {
    advertiserId: creds.advertiserId,
    campaignId,
    adgroupId,
    adId,
    campaignName,
    adgroupName,
    adName,
    warnings,
  };
}
