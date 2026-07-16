/**
 * TikTok Marketing API 沙盒：与正式 Catalog OAuth / business-api 完全隔离。
 * 凭证仅来自环境变量，绝不读取 AdPlatformCredential。
 *
 * Seed 建 Campaign → AdGroup（v1.3，需 identity）→ Ad（v1.2 workaround，仍传 identity）；
 * Insights 指标由本地 mock 注入（沙盒无真实投放）。
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { AdsInsightsCampaign, AdsInsightsDeepRow, AdsInsightsMetrics } from "./types.server";
import { finalizeMetrics } from "./types.server";
import { mergeMetrics } from "./nest.server";
import { formatOutboundErrorLog, formatOutboundNetworkError } from "../common/outboundError.server";

export const TIKTOK_SANDBOX_API_BASE = "https://sandbox-ads.tiktok.com/open_api/v1.3";
/** 沙盒 ad/create 降级至 v1.2（沙盒仍要求 identity；CUSTOMIZED_USER 在 v1.2/v1.3 均被拒）。 */
export const TIKTOK_SANDBOX_API_BASE_V12 = "https://sandbox-ads.tiktok.com/open_api/v1.2";

const LOG_PREFIX = "[AdsInsights][TikTok][Sandbox]";
/** 沙盒 App QPS 上限为 1；两次请求完成间隔至少 1.5s。 */
const SANDBOX_MIN_REQUEST_INTERVAL_MS = 1_500;
const SANDBOX_QPS_MAX_RETRIES = 5;
/** 沙盒创意占位图；可用 TIKTOK_SANDBOX_IMAGE_ID 覆盖。 */
const DEFAULT_SANDBOX_IMAGE_ID = "ad-site-i18n-sg/202208095d0d1d72383f815646c5b090";
/** 无 Spark 帖子时，可用 TIKTOK_SANDBOX_SEED_VIDEO_FILE / TIKTOK_SANDBOX_SEED_VIDEO_URL 上传广告素材。 */

let sandboxRequestQueue: Promise<unknown> = Promise.resolve();
let lastSandboxRequestFinishedAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 判断 API base 是否为 TikTok 沙盒域名。 */
export function isTiktokSandboxApiBase(apiBase?: string): boolean {
  return (apiBase ?? TIKTOK_SANDBOX_API_BASE).includes("sandbox-ads.tiktok.com");
}

/** TikTok 沙盒 QPS 限流错误文案识别（便于单测与重试判断）。 */
export function isTiktokSandboxQpsLimitMessage(message: string): boolean {
  return /qps\s*limit/i.test(message);
}

function enqueueSandboxRequest<T>(task: () => Promise<T>): Promise<T> {
  const run = sandboxRequestQueue.then(async () => {
    const elapsed = Date.now() - lastSandboxRequestFinishedAt;
    if (elapsed < SANDBOX_MIN_REQUEST_INTERVAL_MS) {
      await sleep(SANDBOX_MIN_REQUEST_INTERVAL_MS - elapsed);
    }
    try {
      return await task();
    } finally {
      lastSandboxRequestFinishedAt = Date.now();
    }
  });
  sandboxRequestQueue = run.catch(() => undefined);
  return run;
}

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
  return enqueueSandboxRequest(async () => {
    const apiBase = params.apiBase ?? TIKTOK_SANDBOX_API_BASE;
    const url = new URL(`${apiBase}${params.path}`);
    for (const [key, value] of Object.entries(params.query ?? {})) {
      url.searchParams.set(key, value);
    }
    const method = params.method ?? (params.body ? "POST" : "GET");

    for (let attempt = 0; attempt <= SANDBOX_QPS_MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const backoffMs = SANDBOX_MIN_REQUEST_INTERVAL_MS * attempt;
        console.warn(
          `${LOG_PREFIX} QPS limit on ${params.path}, retry ${attempt}/${SANDBOX_QPS_MAX_RETRIES} after ${backoffMs}ms`,
        );
        await sleep(backoffMs);
      }

      let response: Response;
      try {
        response = await fetch(url.toString(), {
          method,
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
        if (isTiktokSandboxQpsLimitMessage(detail) && attempt < SANDBOX_QPS_MAX_RETRIES) {
          continue;
        }
        throw new Error(`TikTok Sandbox ${params.path}: ${detail}`);
      }
      return json;
    }

    throw new Error(`TikTok Sandbox ${params.path}: QPS limit retries exhausted`);
  });
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

const SPARK_IDENTITY_TYPES = new Set(["TT_USER", "AUTH_CODE", "BC_AUTH_TT"]);

/** TT_USER 等授权账号身份需绑定 TikTok 帖子（Spark Ad），不能用上传图片。 */
export function isTiktokSparkIdentityType(identityType: string): boolean {
  return SPARK_IDENTITY_TYPES.has(identityType);
}

/** 从 identity/video/get 结果中取第一条可用 item_id。 */
export function extractFirstTiktokItemId(
  videoList: Array<Record<string, unknown>> | undefined,
): string | null {
  for (const row of videoList ?? []) {
    const id = row.item_id ?? row.tiktok_item_id;
    if (id !== undefined) {
      const normalized = String(id).trim();
      if (normalized) return normalized;
    }
  }
  return null;
}

type SandboxSeedAdCreativePlan =
  | { action: "create"; creative: Record<string, unknown> }
  | { action: "skip"; reason: string };

function resolveSandboxSeedVideoFile(): string {
  return readEnv("TIKTOK_SANDBOX_SEED_VIDEO_FILE");
}

function resolveSandboxSeedVideoUrl(): string {
  return readEnv("TIKTOK_SANDBOX_SEED_VIDEO_URL");
}

async function uploadSandboxAdVideoByFile(params: {
  accessToken: string;
  advertiserId: string;
  filePath: string;
}): Promise<string | null> {
  const filePath = path.resolve(params.filePath);
  if (!existsSync(filePath)) return null;

  const buffer = readFileSync(filePath);
  const signature = createHash("md5").update(buffer).digest("hex");
  const fileName = path.basename(filePath);

  const json = await enqueueSandboxRequest(async () => {
    const form = new FormData();
    form.append("advertiser_id", params.advertiserId);
    form.append("upload_type", "UPLOAD_BY_FILE");
    form.append("video_signature", signature);
    form.append("file_name", fileName);
    form.append("video_file", new Blob([buffer]), fileName);

    const response = await fetch(`${TIKTOK_SANDBOX_API_BASE}/file/video/ad/upload/`, {
      method: "POST",
      headers: { "Access-Token": params.accessToken },
      body: form,
    });
    const payload = (await response.json().catch(() => ({}))) as TiktokApiJson<{
      data?: Array<{ video_id?: string }> | { video_id?: string };
    }>;
    if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
      throw new Error(`TikTok Sandbox /file/video/ad/upload/: ${payload.message || `HTTP ${response.status}`}`);
    }
    return payload;
  });

  const row = Array.isArray(json.data) ? json.data[0] : json.data;
  const videoId = row?.video_id;
  return videoId !== undefined ? String(videoId).trim() || null : null;
}

async function uploadSandboxAdVideoByUrl(params: {
  accessToken: string;
  advertiserId: string;
  videoUrl: string;
  fileName: string;
}): Promise<string | null> {
  const json = await tiktokSandboxRequest<{
    data?: Array<{ video_id?: string }> | { video_id?: string };
  }>({
    method: "POST",
    path: "/file/video/ad/upload/",
    accessToken: params.accessToken,
    body: {
      advertiser_id: params.advertiserId,
      upload_type: "UPLOAD_BY_URL",
      video_url: params.videoUrl,
      file_name: params.fileName,
    },
  });
  const row = Array.isArray(json.data) ? json.data[0] : json.data;
  const videoId = row?.video_id;
  return videoId !== undefined ? String(videoId).trim() || null : null;
}

function buildSparkPostAdCreative(params: {
  adName: string;
  identityId: string;
  identityType: string;
  tiktokItemId: string;
}): Record<string, unknown> {
  return {
    ad_name: params.adName,
    identity_id: params.identityId,
    identity_type: params.identityType,
    tiktok_item_id: params.tiktokItemId,
    ad_text: "Spark sandbox test",
    call_to_action: "LEARN_MORE",
    landing_page_url: "https://example.com",
  };
}

function buildUploadedVideoAdCreative(params: {
  adName: string;
  identityId: string;
  identityType: string;
  videoId: string;
  coverImageId?: string | null;
}): Record<string, unknown> {
  const creative: Record<string, unknown> = {
    ad_name: params.adName,
    ad_format: "SINGLE_VIDEO",
    identity_id: params.identityId,
    identity_type: params.identityType,
    video_id: params.videoId,
    ad_text: "Spark sandbox test",
    call_to_action: "LEARN_MORE",
    landing_page_url: "https://example.com",
  };
  if (params.coverImageId) {
    creative.image_ids = [params.coverImageId];
  }
  return creative;
}

async function resolveUploadedVideoAdCreative(params: {
  adName: string;
  identityId: string;
  identityType: string;
  accessToken: string;
  advertiserId: string;
}): Promise<SandboxSeedAdCreativePlan> {
  const videoFile = resolveSandboxSeedVideoFile();
  const videoUrl = resolveSandboxSeedVideoUrl();
  let videoId: string | null = null;

  if (videoFile) {
    videoId = await uploadSandboxAdVideoByFile({
      accessToken: params.accessToken,
      advertiserId: params.advertiserId,
      filePath: videoFile,
    });
    if (!videoId) {
      return {
        action: "skip",
        reason: `无法从 TIKTOK_SANDBOX_SEED_VIDEO_FILE 上传视频：${path.resolve(videoFile)}`,
      };
    }
  } else if (videoUrl) {
    videoId = await uploadSandboxAdVideoByUrl({
      accessToken: params.accessToken,
      advertiserId: params.advertiserId,
      videoUrl,
      fileName: `spark-sandbox-${Date.now().toString(36)}.mp4`,
    });
    if (!videoId) {
      return {
        action: "skip",
        reason: "无法从 TIKTOK_SANDBOX_SEED_VIDEO_URL 上传视频，请改用本地文件或检查 URL 可被 TikTok 拉取",
      };
    }
  } else {
    return {
      action: "skip",
      reason:
        "无 Spark 帖子且未配置测试视频：请在 @ciwiai 发布一条公开视频，或设置 TIKTOK_SANDBOX_SEED_VIDEO_FILE（推荐，竖屏 ≥540×960），也可运行 node scripts/upload-tiktok-sandbox-creative.mjs --file <mp4>",
    };
  }

  return {
    action: "create",
    creative: buildUploadedVideoAdCreative({
      adName: params.adName,
      identityId: params.identityId,
      identityType: params.identityType,
      videoId,
      coverImageId: null,
    }),
  };
}

async function resolveSandboxSeedAdCreative(params: {
  adName: string;
  imageId: string;
  identityId: string;
  identityType: string;
  displayName: string | null;
  accessToken: string;
  advertiserId: string;
}): Promise<SandboxSeedAdCreativePlan> {
  if (params.identityType === "CUSTOMIZED_USER") {
    return {
      action: "skip",
      reason:
        "沙盒已不再支持 CUSTOMIZED_USER 创建广告；请改用 TT_USER，并在对应 TikTok 账号发布至少一条公开视频",
    };
  }

  if (isTiktokSparkIdentityType(params.identityType)) {
    const videoJson = await tiktokSandboxRequest<{
      data?: { video_list?: Array<Record<string, unknown>> };
    }>({
      path: "/identity/video/get/",
      accessToken: params.accessToken,
      query: {
        advertiser_id: params.advertiserId,
        identity_id: params.identityId,
        identity_type: params.identityType,
        page: "1",
        page_size: "10",
      },
    });
    const tiktokItemId = extractFirstTiktokItemId(videoJson.data?.video_list);
    if (tiktokItemId) {
      return {
        action: "create",
        creative: buildSparkPostAdCreative({
          adName: params.adName,
          identityId: params.identityId,
          identityType: params.identityType,
          tiktokItemId,
        }),
      };
    }

    console.warn(
      `${LOG_PREFIX} seed no spark post for identity ${params.identityId}; uploading ad video asset instead`,
    );
    return resolveUploadedVideoAdCreative({
      adName: params.adName,
      identityId: params.identityId,
      identityType: params.identityType,
      accessToken: params.accessToken,
      advertiserId: params.advertiserId,
    });
  }

  return {
    action: "create",
    creative: buildAdCreativeV12(params),
  };
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
      const creativePlan = await resolveSandboxSeedAdCreative({
        adName,
        imageId,
        identityId: creds.identityId,
        identityType: creds.identityType,
        displayName,
        accessToken: creds.accessToken,
        advertiserId: creds.advertiserId,
      });
      if (creativePlan.action === "skip") {
        warnings.push(`ad/create 跳过: ${creativePlan.reason}`);
      } else {
        const adJson = await tiktokSandboxRequest<{ data?: Record<string, unknown> }>({
          method: "POST",
          path: "/ad/create/",
          accessToken: creds.accessToken,
          apiBase: TIKTOK_SANDBOX_API_BASE_V12,
          body: {
            advertiser_id: creds.advertiserId,
            adgroup_id: adgroupId,
            creatives: [creativePlan.creative],
          },
        });
        adId = extractAdId(adJson.data);
        if (!adId) {
          warnings.push("ad/create 未返回 ad_id");
        }
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
