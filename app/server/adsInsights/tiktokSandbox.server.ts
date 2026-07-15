/**
 * TikTok Marketing API 沙盒：与正式 Catalog OAuth / business-api 完全隔离。
 * 凭证仅来自环境变量，绝不读取 AdPlatformCredential。
 */

import { formatOutboundErrorLog, formatOutboundNetworkError } from "../common/outboundError.server";

export const TIKTOK_SANDBOX_API_BASE = "https://sandbox-ads.tiktok.com/open_api/v1.3";
/** seed 的 ad/create 固定走 v1.2（v1.3 常强制 identity，沙盒更易失败）。 */
const TIKTOK_SANDBOX_AD_CREATE_API_BASE = "https://sandbox-ads.tiktok.com/open_api/v1.2";

const LOG_PREFIX = "[AdsInsights][TikTok][Sandbox]";
const DEFAULT_IDENTITY_TYPE = "CUSTOMIZED_USER";
/** 沙盒占位图；可用 TIKTOK_SANDBOX_IMAGE_ID 覆盖为账户内真实素材。 */
const DEFAULT_SANDBOX_IMAGE_ID = "ad-site-i18n-sg/202208095d0d1d72383f815646c5b090";

export type TiktokSandboxCredentials = {
  accessToken: string;
  advertiserId: string;
  accountName: string | null;
};

export type TiktokSandboxIdentity = {
  identityId: string;
  identityType: string;
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

/** 从环境变量读取 Identity（ad/create 所需）。 */
export function getTiktokSandboxIdentityFromEnv(): TiktokSandboxIdentity | null {
  const identityId = readEnv("TIKTOK_SANDBOX_IDENTITY_ID");
  if (!identityId) return null;
  return {
    identityId,
    identityType: readEnv("TIKTOK_SANDBOX_IDENTITY_TYPE") || DEFAULT_IDENTITY_TYPE,
  };
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
  adId: string | null;
  campaignName: string;
  adgroupName: string;
  adName: string;
  identityId: string | null;
  identityType: string | null;
  warnings: string[];
};

function formatScheduleStart(): string {
  const d = new Date();
  d.setUTCMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00:00`;
}

type IdentityListItem = {
  identity_id?: string;
  identity_type?: string;
};

/**
 * 解析沙盒 Identity：环境变量 → identity/get → identity/create。
 * 部分沙盒账户不支持 identity 相关接口；失败时记入 warnings 并返回 null。
 */
export async function resolveTiktokSandboxIdentity(params: {
  accessToken: string;
  advertiserId: string;
  displayName: string;
  warnings: string[];
}): Promise<TiktokSandboxIdentity | null> {
  const fromEnv = getTiktokSandboxIdentityFromEnv();
  if (fromEnv) return fromEnv;

  try {
    const json = await tiktokSandboxRequest<{
      data?: { identity_list?: IdentityListItem[]; list?: IdentityListItem[] };
    }>({
      path: "/identity/get/",
      accessToken: params.accessToken,
      query: {
        advertiser_id: params.advertiserId,
        page: "1",
        page_size: "20",
      },
    });
    const list = json.data?.identity_list ?? json.data?.list ?? [];
    const first = list.find((row) => String(row.identity_id ?? "").trim());
    const identityId = String(first?.identity_id ?? "").trim();
    if (identityId) {
      return {
        identityId,
        identityType: String(first?.identity_type ?? DEFAULT_IDENTITY_TYPE).trim() || DEFAULT_IDENTITY_TYPE,
      };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    params.warnings.push(`identity/get 失败: ${msg}`);
    console.warn(`${LOG_PREFIX} identity/get ${formatOutboundErrorLog(e)}`);
  }

  try {
    const json = await tiktokSandboxRequest<{ data?: { identity_id?: string } }>({
      method: "POST",
      path: "/identity/create/",
      accessToken: params.accessToken,
      body: {
        advertiser_id: params.advertiserId,
        display_name: params.displayName.slice(0, 100),
        image_uri: sandboxImageId(),
      },
    });
    const identityId = String(json.data?.identity_id ?? "").trim();
    if (identityId) {
      return { identityId, identityType: DEFAULT_IDENTITY_TYPE };
    }
    params.warnings.push("identity/create 未返回 identity_id");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    params.warnings.push(`identity/create 失败: ${msg}`);
    console.warn(`${LOG_PREFIX} identity/create ${formatOutboundErrorLog(e)}`);
  }

  return null;
}

function buildCreativeBody(params: {
  advertiserId: string;
  adgroupId: string;
  adName: string;
  displayName: string;
  identity: TiktokSandboxIdentity | null;
}): Record<string, unknown> {
  const creative: Record<string, unknown> = {
    ad_name: params.adName,
    ad_format: "SINGLE_IMAGE",
    ad_text: "Spark sandbox test ad",
    call_to_action: "LEARN_MORE",
    landing_page_url: "https://www.example.com",
    display_name: params.displayName,
    image_ids: [sandboxImageId()],
  };
  if (params.identity) {
    creative.identity_id = params.identity.identityId;
    creative.identity_type = params.identity.identityType;
  }
  return {
    advertiser_id: params.advertiserId,
    adgroup_id: params.adgroupId,
    creatives: [creative],
  };
}

async function createSandboxAd(params: {
  accessToken: string;
  body: Record<string, unknown>;
  warnings: string[];
}): Promise<string | null> {
  try {
    const adJson = await tiktokSandboxRequest<{
      data?: { ad_ids?: Array<string | number>; creatives?: Array<{ ad_id?: string }> };
    }>({
      method: "POST",
      path: "/ad/create/",
      accessToken: params.accessToken,
      apiBase: TIKTOK_SANDBOX_AD_CREATE_API_BASE,
      body: params.body,
    });
    const adId =
      String(adJson.data?.ad_ids?.[0] ?? adJson.data?.creatives?.[0]?.ad_id ?? "").trim() || null;
    if (adId) return adId;
    params.warnings.push("ad/create(v1.2) 未返回 ad_id");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    params.warnings.push(`ad/create(v1.2) 失败（沙盒常缺 identity/素材）: ${msg}`);
    console.warn(`${LOG_PREFIX} seed ad v1.2 ${formatOutboundErrorLog(e)}`);
  }
  return null;
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

  const identity = await resolveTiktokSandboxIdentity({
    accessToken: creds.accessToken,
    advertiserId: creds.advertiserId,
    displayName,
    warnings,
  });
  if (!identity) {
    warnings.push(
      "未获得 identity_id：请设置 TIKTOK_SANDBOX_IDENTITY_ID（及可选 TIKTOK_SANDBOX_IDENTITY_TYPE），或在沙盒后台创建 Identity",
    );
  }

  let adId: string | null = null;
  if (adgroupId) {
    adId = await createSandboxAd({
      accessToken: creds.accessToken,
      warnings,
      body: buildCreativeBody({
        advertiserId: creds.advertiserId,
        adgroupId,
        adName,
        displayName,
        identity,
      }),
    });
  }

  return {
    advertiserId: creds.advertiserId,
    campaignId,
    adgroupId,
    adId,
    campaignName,
    adgroupName,
    adName,
    identityId: identity?.identityId ?? null,
    identityType: identity?.identityType ?? null,
    warnings,
  };
}
