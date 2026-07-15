/**
 * TikTok Marketing API 沙盒：与正式 Catalog OAuth / business-api 完全隔离。
 * 凭证仅来自环境变量，绝不读取 AdPlatformCredential。
 */

import { formatOutboundErrorLog, formatOutboundNetworkError } from "../common/outboundError.server";

export const TIKTOK_SANDBOX_API_BASE = "https://sandbox-ads.tiktok.com/open_api/v1.3";
/** 沙盒 v1.3 ad/create 常强制 identity；v1.2 可作为无 identity 的回退。 */
const TIKTOK_SANDBOX_API_BASE_V12 = "https://sandbox-ads.tiktok.com/open_api/v1.2";

const LOG_PREFIX = "[AdsInsights][TikTok][Sandbox]";

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

/**
 * 在沙盒账户创建最小 Campaign → AdGroup → Ad 结构。
 * Ad 创建可能因沙盒不支持 identity / 素材而失败；此时仍返回已创建的系列与组。
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
  const adName = `Spark Sandbox Ad ${stamp}`;
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

  let adId: string | null = null;
  if (adgroupId) {
    const creativeBody = {
      advertiser_id: creds.advertiserId,
      adgroup_id: adgroupId,
      creatives: [
        {
          ad_name: adName,
          ad_format: "SINGLE_IMAGE",
          ad_text: "Spark sandbox test ad",
          call_to_action: "LEARN_MORE",
          landing_page_url: "https://www.example.com",
          display_name: creds.accountName || "Spark Sandbox",
          // 沙盒占位图 ID 常不可用；失败时落入 warnings，结构仍可从系列/组展示。
          image_ids: ["ad-site-i18n-sg/202208095d0d1d72383f815646c5b090"],
        },
      ],
    };

    try {
      const adJson = await tiktokSandboxRequest<{
        data?: { ad_ids?: Array<string | number>; creatives?: Array<{ ad_id?: string }> };
      }>({
        method: "POST",
        path: "/ad/create/",
        accessToken: creds.accessToken,
        apiBase: TIKTOK_SANDBOX_API_BASE_V12,
        body: creativeBody,
      });
      adId =
        String(adJson.data?.ad_ids?.[0] ?? adJson.data?.creatives?.[0]?.ad_id ?? "").trim() || null;
      if (!adId) warnings.push("ad/create(v1.2) 未返回 ad_id");
    } catch (e1) {
      try {
        const adJson = await tiktokSandboxRequest<{
          data?: { ad_ids?: Array<string | number>; creatives?: Array<{ ad_id?: string }> };
        }>({
          method: "POST",
          path: "/ad/create/",
          accessToken: creds.accessToken,
          body: creativeBody,
        });
        adId =
          String(adJson.data?.ad_ids?.[0] ?? adJson.data?.creatives?.[0]?.ad_id ?? "").trim() || null;
        if (!adId) warnings.push("ad/create(v1.3) 未返回 ad_id");
      } catch (e2) {
        const msg = e2 instanceof Error ? e2.message : String(e2);
        warnings.push(`ad/create 失败（沙盒常缺 identity/素材）: ${msg}`);
        console.warn(`${LOG_PREFIX} seed ad ${formatOutboundErrorLog(e1)}; fallback ${formatOutboundErrorLog(e2)}`);
      }
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
