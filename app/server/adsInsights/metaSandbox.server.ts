/**
 * Meta Marketing API 沙盒：与正式 Catalog / Meta Ads OAuth 完全隔离。
 * 凭证仅来自环境变量，绝不读取 AdPlatformCredential。
 */

import { META_GRAPH_BASE, getMetaPages } from "../adsCatalog/metaOAuth.server";
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
  /** 最终成功的 seed 策略 */
  strategy?: string;
  strategyLabel?: string;
  /** 各策略尝试记录（成功时含失败项） */
  attempts?: Array<{ strategy: string; ok: boolean; message?: string }>;
  warnings: string[];
};

export type MetaApiError = {
  message?: string;
  error_user_title?: string;
  error_user_msg?: string;
  error_subcode?: number;
};

/** Meta 拒绝开发模式 App 通过 object_story_spec 隐式创建主页帖时的 subcode。 */
export const META_DEV_MODE_CREATIVE_POST_SUBCODE = 1885183;

export function isMetaDevModeCreativePostError(error: MetaApiError | undefined): boolean {
  if (!error) return false;
  if (error.error_subcode === META_DEV_MODE_CREATIVE_POST_SUBCODE) return true;
  const text = [error.error_user_title, error.error_user_msg, error.message].filter(Boolean).join(" ");
  return /development mode/i.test(text);
}

export function normalizeObjectStoryId(pageId: string, rawId: string): string {
  const id = rawId.trim();
  if (!id) return id;
  if (id.includes("_")) return id;
  return `${pageId}_${id}`;
}

function readEnv(name: string): string {
  return (process.env[name] || "").trim();
}

/** 供 seed 子模块读取沙盒 env（不暴露 token）。 */
export function readMetaSandboxEnv(name: string): string {
  return readEnv(name);
}

/** Meta API 预算单位为账户货币的最小单位（如 USD/CNY 为分）。默认 1000 = 10.00，满足 CNY 最低约 6.81。 */
export function resolveSandboxSeedDailyBudgetCents(): number {
  const raw = readEnv("META_SANDBOX_SEED_DAILY_BUDGET_CENTS");
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 1000;
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

export function normalizeAdAccountId(id: string): string {
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

export async function metaPost<T = Record<string, unknown>>(
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
    const err = json.error;
    const message = formatMetaError(err, `Meta API HTTP ${response.status}`);
    const error = new Error(`[${step}] ${message}`) as Error & { metaError?: MetaApiError };
    error.metaError = err;
    throw error;
  }
  return json as T;
}

export async function metaGet<T>(path: string, accessToken: string, query?: Record<string, string>): Promise<T> {
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

export async function resolveSandboxPageId(params: {
  accessToken: string;
  adAccountId: string;
  pageId?: string | null;
}): Promise<string | null> {
  if (params.pageId) return params.pageId;

  const accountId = normalizeAdAccountId(params.adAccountId);

  // 广告账户可投放的主页（与 Business Manager 资产关联最相关）
  try {
    const json = await metaGet<{ data?: Array<{ id?: string }> }>(
      `${accountId}/promote_pages`,
      params.accessToken,
      { fields: "id,name", limit: "25" },
    );
    const pageId = json.data?.[0]?.id?.trim();
    if (pageId) return pageId;
  } catch (e) {
    console.warn(`${LOG_PREFIX} promote_pages lookup failed ${formatOutboundErrorLog(e)}`);
  }

  // 用户可管理的主页（与广告创建页 getMetaPages 一致）
  try {
    const pages = await getMetaPages(params.accessToken);
    if (pages.length > 0) return pages[0].pageId;
  } catch (e) {
    console.warn(`${LOG_PREFIX} getMetaPages failed ${formatOutboundErrorLog(e)}`);
  }

  // 部分 token 仅暴露 me/pages
  try {
    const json = await metaGet<{ data?: Array<{ id?: string }> }>(
      "me/pages",
      params.accessToken,
      { fields: "id,name", limit: "25" },
    );
    const pageId = json.data?.[0]?.id?.trim();
    if (pageId) return pageId;
  } catch (e) {
    console.warn(`${LOG_PREFIX} me/pages lookup failed ${formatOutboundErrorLog(e)}`);
  }

  return null;
}

async function resolvePageAccessToken(accessToken: string, pageId: string): Promise<string | null> {
  try {
    const json = await metaGet<{ data?: Array<{ id?: string; access_token?: string }> }>(
      "me/accounts",
      accessToken,
      { fields: "id,access_token", limit: "100" },
    );
    const match = json.data?.find((row) => row.id?.trim() === pageId);
    return match?.access_token?.trim() || null;
  } catch (e) {
    console.warn(`${LOG_PREFIX} page access_token lookup failed ${formatOutboundErrorLog(e)}`);
    return null;
  }
}

async function listPagePostStoryIds(accessToken: string, pageId: string): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();
  const pushRows = (rows: Array<{ id?: string }> | undefined) => {
    for (const row of rows ?? []) {
      const storyId = normalizeObjectStoryId(pageId, row.id ?? "");
      if (!storyId || seen.has(storyId)) continue;
      seen.add(storyId);
      out.push(storyId);
    }
  };

  try {
    const json = await metaGet<{ data?: Array<{ id?: string }> }>(
      `${pageId}/promotable_posts`,
      accessToken,
      { fields: "id", limit: "25" },
    );
    pushRows(json.data);
    if (out.length > 0) return out;
  } catch (e) {
    console.warn(`${LOG_PREFIX} promotable_posts lookup failed ${formatOutboundErrorLog(e)}`);
  }

  // published_posts / feed 需要 Page Access Token
  const pageAccessToken = await resolvePageAccessToken(accessToken, pageId);
  const postToken = pageAccessToken ?? accessToken;
  for (const edge of ["published_posts", "feed"] as const) {
    try {
      const json = await metaGet<{ data?: Array<{ id?: string }> }>(
        `${pageId}/${edge}`,
        postToken,
        { fields: "id", limit: "25" },
      );
      pushRows(json.data);
      if (out.length > 0) return out;
    } catch (e) {
      console.warn(`${LOG_PREFIX} ${edge} lookup failed ${formatOutboundErrorLog(e)}`);
    }
  }

  return out;
}

async function createPageLinkPostStoryId(params: {
  pageId: string;
  pageAccessToken: string;
  linkUrl: string;
  message: string;
}): Promise<string> {
  const resp = await metaPost<{ id: string }>(
    `${params.pageId}/feed`,
    params.pageAccessToken,
    {
      message: params.message,
      link: params.linkUrl,
    },
    "创建沙盒主页帖",
  );
  return normalizeObjectStoryId(params.pageId, resp.id);
}

export function buildMetaDevModeCreativeHint(): string {
  return [
    "Meta App 处于开发模式，无法通过 API 隐式创建广告帖。",
    "请任选其一：① 在 Facebook 主页手动发一条带链接的帖文后重试；",
    "② 在 .env 设置 META_SANDBOX_SEED_OBJECT_STORY_ID=<pageId_postId>；",
    "③ 在 Meta 开发者后台将 App 切换为 Live（公开）模式。",
  ].join("");
}

type SandboxObjectStoryResolution = {
  objectStoryId: string | null;
  source: "env" | "existing_posts" | "page_feed" | "none";
};

export async function resolveSandboxObjectStoryId(params: {
  accessToken: string;
  pageId: string;
  linkUrl: string;
  message: string;
  /** 是否允许通过 Page Token 发新帖 */
  allowCreatePagePost?: boolean;
  /** 为 true 时跳过复用已有帖，仅尝试发新帖 */
  requireNewPagePost?: boolean;
}): Promise<SandboxObjectStoryResolution> {
  if (!params.requireNewPagePost) {
    const envStoryId = readEnv("META_SANDBOX_SEED_OBJECT_STORY_ID");
    if (envStoryId) {
      return {
        objectStoryId: normalizeObjectStoryId(params.pageId, envStoryId),
        source: "env",
      };
    }

    const existingPosts = await listPagePostStoryIds(params.accessToken, params.pageId);
    if (existingPosts.length > 0) {
      return { objectStoryId: existingPosts[0], source: "existing_posts" };
    }
  }

  if (params.allowCreatePagePost !== false) {
    const pageAccessToken = await resolvePageAccessToken(params.accessToken, params.pageId);
    if (pageAccessToken) {
      try {
        const objectStoryId = await createPageLinkPostStoryId({
          pageId: params.pageId,
          pageAccessToken,
          linkUrl: params.linkUrl,
          message: params.message,
        });
        return { objectStoryId, source: "page_feed" };
      } catch (e) {
        console.warn(`${LOG_PREFIX} page feed post failed ${formatOutboundErrorLog(e)}`);
      }
    }
  }

  return { objectStoryId: null, source: "none" };
}

/** 列举沙盒 token 可发现的 Facebook Page（调试用）。 */
export async function listMetaSandboxPages(): Promise<Array<{ pageId: string; name?: string }>> {
  const creds = getMetaSandboxCredentials();
  if (!creds) return [];

  const seen = new Set<string>();
  const out: Array<{ pageId: string; name?: string }> = [];
  const push = (rows: Array<{ id?: string; name?: string; pageId?: string }> | undefined) => {
    for (const row of rows ?? []) {
      const pageId = (row.pageId ?? row.id ?? "").trim();
      if (!pageId || seen.has(pageId)) continue;
      seen.add(pageId);
      out.push({ pageId, name: row.name });
    }
  };

  const accountId = normalizeAdAccountId(creds.adAccountId);
  try {
    const json = await metaGet<{ data?: Array<{ id?: string; name?: string }> }>(
      `${accountId}/promote_pages`,
      creds.accessToken,
      { fields: "id,name", limit: "50" },
    );
    push(json.data);
  } catch (e) {
    console.warn(`${LOG_PREFIX} list promote_pages failed ${formatOutboundErrorLog(e)}`);
  }

  try {
    push(await getMetaPages(creds.accessToken).then((pages) =>
      pages.map((p) => ({ id: p.pageId, name: p.name })),
    ));
  } catch (e) {
    console.warn(`${LOG_PREFIX} list getMetaPages failed ${formatOutboundErrorLog(e)}`);
  }

  try {
    const json = await metaGet<{ data?: Array<{ id?: string; name?: string }> }>(
      "me/pages",
      creds.accessToken,
      { fields: "id,name", limit: "50" },
    );
    push(json.data);
  } catch (e) {
    console.warn(`${LOG_PREFIX} list me/pages failed ${formatOutboundErrorLog(e)}`);
  }

  return out;
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

export { seedMetaSandboxMinimalStructure } from "./metaSandboxSeed.server";
