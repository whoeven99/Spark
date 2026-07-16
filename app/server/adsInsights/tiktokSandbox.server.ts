/**
 * TikTok Marketing API 沙盒：与正式 Catalog OAuth / business-api 完全隔离。
 * 凭证仅来自环境变量，绝不读取 AdPlatformCredential。
 */

import { formatOutboundErrorLog, formatOutboundNetworkError } from "../common/outboundError.server";

export const TIKTOK_SANDBOX_API_BASE = "https://sandbox-ads.tiktok.com/open_api/v1.3";
/** seed 的 ad/create 固定走 v1.2（v1.3 常强制 identity，沙盒更易失败）。 */
const TIKTOK_SANDBOX_AD_CREATE_API_BASE = "https://sandbox-ads.tiktok.com/open_api/v1.2";

const LOG_PREFIX = "[AdsInsights][TikTok][Sandbox]";
/** 沙盒创意占位图；可用 TIKTOK_SANDBOX_IMAGE_ID 覆盖。 */
const DEFAULT_SANDBOX_IMAGE_ID = "ad-site-i18n-sg/202208095d0d1d72383f815646c5b090";
/**
 * 占位视频（TikTok 服务端拉取）；须为可公网访问的短 MP4。
 * 每次 seed 用唯一 file_name，避免同名冲突。
 */
const DEFAULT_SANDBOX_VIDEO_URL =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4";

export type TiktokSandboxCredentials = {
  accessToken: string;
  advertiserId: string;
  accountName: string | null;
};

function readEnv(name: string): string {
  return (process.env[name] || "").trim();
}

/** 沙盒凭证是否已配置（不暴露 token）。 */
export function isTiktokSandboxConfigured(): boolean {
  return Boolean(readEnv("TIKTOK_SANDBOX_ACCESS_TOKEN") && readEnv("TIKTOK_SANDBOX_ADVERTISER_ID"));
}

/** 读取沙盒环境变量；未配置时返回 null。 */
export function getTiktokSandboxCredentials(): TiktokSandboxCredentials | null {
  const accessToken = readEnv("TIKTOK_SANDBOX_ACCESS_TOKEN");
  const advertiserId = readEnv("TIKTOK_SANDBOX_ADVERTISER_ID");
  if (!accessToken || !advertiserId) return null;
  const accountName = readEnv("TIKTOK_SANDBOX_ACCOUNT_NAME") || null;
  return { accessToken, advertiserId, accountName };
}

function sandboxImageId(): string {
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
  imageAdId: string | null;
  videoAdId: string | null;
  videoId: string | null;
  campaignName: string;
  adgroupName: string;
  imageAdName: string;
  videoAdName: string;
  warnings: string[];
};

function formatScheduleStart(): string {
  const d = new Date();
  d.setUTCMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00:00`;
}

/**
 * 上传占位视频到沙盒素材库，返回 video_id。
 * 优先 TIKTOK_SANDBOX_VIDEO_URL；否则用内置样例 URL（UPLOAD_BY_URL）。
 */
export async function uploadTiktokSandboxPlaceholderVideo(params: {
  accessToken: string;
  advertiserId: string;
  fileName: string;
}): Promise<string> {
  const videoUrl = readEnv("TIKTOK_SANDBOX_VIDEO_URL") || DEFAULT_SANDBOX_VIDEO_URL;
  const json = await tiktokSandboxRequest<{
    data?: { video_id?: string; id?: string };
  }>({
    method: "POST",
    path: "/file/video/ad/upload/",
    accessToken: params.accessToken,
    body: {
      advertiser_id: params.advertiserId,
      upload_type: "UPLOAD_BY_URL",
      file_name: params.fileName.slice(0, 100),
      video_url: videoUrl,
    },
  });
  const videoId = String(json.data?.video_id ?? json.data?.id ?? "").trim();
  if (!videoId) {
    throw new Error("TikTok Sandbox /file/video/ad/upload/ 未返回 video_id");
  }
  return videoId;
}

function buildImageCreative(params: {
  adName: string;
  displayName: string;
}): Record<string, unknown> {
  return {
    ad_name: params.adName,
    ad_format: "SINGLE_IMAGE",
    ad_text: "Spark sandbox test image ad",
    call_to_action: "LEARN_MORE",
    landing_page_url: "https://www.example.com",
    display_name: params.displayName,
    image_ids: [sandboxImageId()],
  };
}

function buildVideoCreative(params: {
  adName: string;
  displayName: string;
  videoId: string;
}): Record<string, unknown> {
  return {
    ad_name: params.adName,
    ad_format: "SINGLE_VIDEO",
    ad_text: "Spark sandbox test video ad",
    call_to_action: "LEARN_MORE",
    landing_page_url: "https://www.example.com",
    display_name: params.displayName,
    video_id: params.videoId,
    // 封面图：与 image ad 共用占位图
    image_ids: [sandboxImageId()],
  };
}

async function createSandboxAd(params: {
  accessToken: string;
  advertiserId: string;
  adgroupId: string;
  creative: Record<string, unknown>;
  warnings: string[];
  label: string;
}): Promise<string | null> {
  try {
    const adJson = await tiktokSandboxRequest<{
      data?: { ad_ids?: Array<string | number>; creatives?: Array<{ ad_id?: string }> };
    }>({
      method: "POST",
      path: "/ad/create/",
      accessToken: params.accessToken,
      apiBase: TIKTOK_SANDBOX_AD_CREATE_API_BASE,
      body: {
        advertiser_id: params.advertiserId,
        adgroup_id: params.adgroupId,
        creatives: [params.creative],
      },
    });
    const adId =
      String(adJson.data?.ad_ids?.[0] ?? adJson.data?.creatives?.[0]?.ad_id ?? "").trim() || null;
    if (adId) return adId;
    params.warnings.push(`ad/create(v1.2) ${params.label} 未返回 ad_id`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    params.warnings.push(`ad/create(v1.2) ${params.label} 失败: ${msg}`);
    console.warn(`${LOG_PREFIX} seed ad ${params.label} ${formatOutboundErrorLog(e)}`);
  }
  return null;
}

/**
 * 在沙盒账户创建最小结构：
 * Campaign → AdGroup → SINGLE_IMAGE Ad + SINGLE_VIDEO Ad（视频素材自动上传）。
 * 不使用 identity_id。
 */
export async function seedTiktokSandboxMinimalStructure(): Promise<TiktokSandboxSeedResult> {
  const creds = getTiktokSandboxCredentials();
  if (!creds) {
    throw new Error(
      "未配置 TikTok 沙盒：请设置 TIKTOK_SANDBOX_ACCESS_TOKEN 与 TIKTOK_SANDBOX_ADVERTISER_ID",
    );
  }

  const stamp = Date.now().toString(36);
  const campaignName = `Spark Sandbox Campaign ${stamp}`;
  const adgroupName = `Spark Sandbox AdGroup ${stamp}`;
  const imageAdName = `Spark Sandbox Image Ad ${stamp}`;
  const videoAdName = `Spark Sandbox Video Ad ${stamp}`;
  const displayName = creds.accountName || "Spark Sandbox";
  const warnings: string[] = [];

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
    const adgroupJson = await tiktokSandboxRequest<{ data?: { adgroup_id?: string } }>({
      method: "POST",
      path: "/adgroup/create/",
      accessToken: creds.accessToken,
      body: {
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
      },
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

  let videoId: string | null = null;
  let imageAdId: string | null = null;
  let videoAdId: string | null = null;

  if (adgroupId) {
    imageAdId = await createSandboxAd({
      accessToken: creds.accessToken,
      advertiserId: creds.advertiserId,
      adgroupId,
      warnings,
      label: "SINGLE_IMAGE",
      creative: buildImageCreative({ adName: imageAdName, displayName }),
    });

    try {
      videoId = await uploadTiktokSandboxPlaceholderVideo({
        accessToken: creds.accessToken,
        advertiserId: creds.advertiserId,
        fileName: `spark-sandbox-video-${stamp}.mp4`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`视频素材上传失败: ${msg}`);
      console.warn(`${LOG_PREFIX} video upload ${formatOutboundErrorLog(e)}`);
    }

    if (videoId) {
      videoAdId = await createSandboxAd({
        accessToken: creds.accessToken,
        advertiserId: creds.advertiserId,
        adgroupId,
        warnings,
        label: "SINGLE_VIDEO",
        creative: buildVideoCreative({
          adName: videoAdName,
          displayName,
          videoId,
        }),
      });
    }
  }

  return {
    advertiserId: creds.advertiserId,
    campaignId,
    adgroupId,
    imageAdId,
    videoAdId,
    videoId,
    campaignName,
    adgroupName,
    imageAdName,
    videoAdName,
    warnings,
  };
}
