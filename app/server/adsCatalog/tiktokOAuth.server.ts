import crypto from "node:crypto";
import { formatOutboundNetworkError } from "../common/outboundError.server";
import {
  buildShopifyAdminHostParam,
  buildAdminEmbeddedAppReturnUrl,
} from "../billing/buildBillingReturnUrl.server";

/**
 * TikTok for Business 开发者后台「Advertiser authorization URL」使用 portal/auth。
 * （旧 marketing_api/auth 仍可用，但与当前 App 配置页不一致。）
 */
export const TIKTOK_OAUTH_BASE = "https://business-api.tiktok.com/portal/auth";
export const TIKTOK_TOKEN_URL =
  "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/";
export const TIKTOK_REFRESH_TOKEN_URL =
  "https://business-api.tiktok.com/open_api/v1.3/oauth2/refresh_token/";
export const TIKTOK_API_BASE = "https://business-api.tiktok.com/open_api/v1.3";

export const TIKTOK_CATALOG_CALLBACK_PATH = "/ads/tiktok-catalog/callback";

/** Shopify 官方同步目录 vs Spark API 可写目录。 */
export type TiktokCatalogBindingMode = "shopify_official" | "api_managed";

export interface TiktokCatalogInfo {
  catalogId: string;
  catalogName?: string;
  /** Business Center ID（Catalog API 必填 bc_id）。 */
  bcId: string;
  /** 授权广告主 ID；商品写入等接口仍可能需要。 */
  advertiserId: string;
  catalogType?: string;
  businessPlatform?: string;
  channel?: string;
  createSource?: string;
  /** 是否判定为 TikTok for Shopify / 官方同步目录。 */
  isShopifyOfficial: boolean;
}

type RawTiktokCatalogRow = {
  catalog_id?: string | number;
  catalog_name?: string;
  catalog_type?: string;
  business_platform?: string;
  channel?: string;
  create_source?: string;
  catalog_conf?: {
    business_platform?: string;
    channel?: string;
    currency?: string;
    region_code?: string;
  };
};

/** 根据 catalog/get 字段与名称启发式判断是否为 Shopify 官方同步目录。 */
export function isShopifyOfficialCatalog(info: {
  catalogName?: string;
  catalogType?: string;
  businessPlatform?: string;
  channel?: string;
  createSource?: string;
  isShopifyOfficial?: boolean;
}): boolean {
  if (info.isShopifyOfficial === true) return true;
  const haystack = [
    info.catalogName,
    info.catalogType,
    info.businessPlatform,
    info.channel,
    info.createSource,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!haystack) return false;
  return (
    haystack.includes("shopify") ||
    haystack.includes("tiktok_shop") ||
    haystack.includes("tiktok shop") ||
    /\btts\b/.test(haystack)
  );
}

/** 识别 product/upload 因 Shopify 同步锁目录而失败的错误文案。 */
export function isShopifySyncedCatalogUploadError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("synced from shopify") ||
    m.includes("cannot be modified via api")
  );
}

export function resolveTiktokBindingMode(
  catalog: Parameters<typeof isShopifyOfficialCatalog>[0],
): TiktokCatalogBindingMode {
  return isShopifyOfficialCatalog(catalog) ? "shopify_official" : "api_managed";
}

/**
 * 自动绑定策略：存在官方 Shopify Catalog 时优先绑定；
 * 否则仅在恰好一本时自动绑定；多本非官方则返回 null（需用户选择）。
 */
export function pickAutoBindTiktokCatalog(
  catalogs: TiktokCatalogInfo[],
): TiktokCatalogInfo | null {
  if (catalogs.length === 0) return null;
  const official = catalogs.find((c) => c.isShopifyOfficial);
  if (official) return official;
  if (catalogs.length === 1) return catalogs[0] ?? null;
  return null;
}

function mapRawTiktokCatalogRow(
  row: RawTiktokCatalogRow,
  params: { bcId: string; advertiserId: string },
): TiktokCatalogInfo | null {
  const catalogId = String(row.catalog_id ?? "").trim();
  if (!catalogId) return null;
  const businessPlatform =
    row.business_platform || row.catalog_conf?.business_platform || undefined;
  const channel = row.channel || row.catalog_conf?.channel || undefined;
  const partial = {
    catalogId,
    catalogName: row.catalog_name,
    bcId: params.bcId,
    advertiserId: params.advertiserId,
    catalogType: row.catalog_type,
    businessPlatform,
    channel,
    createSource: row.create_source,
  };
  return {
    ...partial,
    isShopifyOfficial: isShopifyOfficialCatalog(partial),
  };
}

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function getTiktokAppCredentials(): { appId: string; appSecret: string } {
  return {
    appId: readEnv("TIKTOK_APP_ID"),
    appSecret: readEnv("TIKTOK_APP_SECRET"),
  };
}

/** Resolve the absolute redirect URI for the TikTok OAuth callback path. */
export function getTiktokRedirectUri(path: string, requestOrigin?: string): string {
  const base =
    readEnv("TIKTOK_OAUTH_REDIRECT_BASE") ||
    readEnv("SHOPIFY_APP_URL") ||
    requestOrigin;
  if (!base) {
    throw new Error(
      "无法解析 TikTok OAuth redirect_uri：请配置 SHOPIFY_APP_URL 或 TIKTOK_OAUTH_REDIRECT_BASE",
    );
  }
  return `${base.replace(/\/$/, "")}${path}`;
}

/** TikTok OAuth 完成后跳回嵌入式应用。 */
export function buildTiktokOAuthReturnUrl(params: {
  shop: string;
  host?: string;
  appOrigin?: string;
  query?: Record<string, string>;
  request?: Request;
}): string {
  const adminUrl = buildAdminEmbeddedAppReturnUrl({
    path: "/app/ads-catalog",
    shop: params.shop,
    request: params.request,
    query: params.query,
  });
  if (adminUrl) return adminUrl;

  const base =
    params.appOrigin ||
    readEnv("TIKTOK_OAUTH_REDIRECT_BASE") ||
    readEnv("SHOPIFY_APP_URL") ||
    "https://example.com";
  const target = new URL("/app/ads-catalog", base.replace(/\/$/, "") || base);
  target.searchParams.set("shop", params.shop);
  target.searchParams.set("embedded", "1");
  target.searchParams.set("host", params.host || buildShopifyAdminHostParam(params.shop));
  for (const [key, value] of Object.entries(params.query ?? {})) {
    target.searchParams.set(key, value);
  }
  return target.toString();
}

// ─── Signed, stateless OAuth `state` ─────────────────────────────────────────

function stateSecret(): string {
  return process.env.SHOPIFY_API_SECRET || "spark-tiktok-oauth";
}

export function createTiktokOAuthState(
  shop: string,
  host = "",
  appOrigin = "",
): string {
  const payload = JSON.stringify({
    shop,
    flow: "tiktok_catalog",
    host,
    appOrigin: appOrigin.replace(/\/$/, ""),
    nonce: crypto.randomBytes(8).toString("hex"),
    ts: Date.now(),
  });
  const encoded = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", stateSecret()).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyTiktokOAuthState(
  state: string,
  maxAgeMs = 15 * 60 * 1000,
): { shop: string; host: string; appOrigin: string } | null {
  const [encoded, sig] = state.split(".");
  if (!encoded || !sig) return null;
  const expected = crypto
    .createHmac("sha256", stateSecret())
    .update(encoded)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as {
      shop?: string;
      flow?: string;
      host?: string;
      appOrigin?: string;
      ts?: number;
    };
    if (!payload.shop || payload.flow !== "tiktok_catalog") return null;
    if (typeof payload.ts !== "number" || Date.now() - payload.ts > maxAgeMs) return null;
    return {
      shop: payload.shop,
      host: payload.host ?? "",
      appOrigin: payload.appOrigin ?? "",
    };
  } catch {
    return null;
  }
}

/** Build the TikTok consent screen URL（与开发者后台授权链接参数一致）。 */
export function buildTiktokAuthUrl(params: {
  appId: string;
  state: string;
  redirectUri: string;
}): string {
  const query = new URLSearchParams({
    app_id: params.appId,
    redirect_uri: params.redirectUri,
    state: params.state,
  });
  return `${TIKTOK_OAUTH_BASE}?${query.toString()}`;
}

/** 在嵌入式 iframe 内通过 API 鉴权后生成 TikTok 授权 URL。 */
export function buildTiktokOAuthStartUrl(params: {
  shop: string;
  host?: string;
  requestOrigin: string;
}): { ok: true; authUrl: string } | { ok: false; error: string } {
  const { appId, appSecret } = getTiktokAppCredentials();
  if (!appId || !appSecret) {
    return {
      ok: false,
      error: "缺少 TikTok App 凭证：请配置 TIKTOK_APP_ID / TIKTOK_APP_SECRET 环境变量",
    };
  }
  if (!/^\d+$/.test(appId)) {
    return {
      ok: false,
      error: "TIKTOK_APP_ID 必须是 Marketing API 的数字 App ID（不是 Login Kit client_key）",
    };
  }
  const appOrigin = (readEnv("SHOPIFY_APP_URL") || params.requestOrigin).replace(/\/$/, "");
  const state = createTiktokOAuthState(params.shop, params.host ?? "", appOrigin);
  const authUrl = buildTiktokAuthUrl({
    appId,
    state,
    redirectUri: getTiktokRedirectUri(TIKTOK_CATALOG_CALLBACK_PATH, params.requestOrigin),
  });
  return { ok: true, authUrl };
}

export type TiktokTokenExchangeResult = {
  accessToken: string;
  refreshToken?: string;
  advertiserIds: string[];
};

/** Exchange an authorization code for an access token and advertiser IDs. */
export async function exchangeTiktokAuthCode(params: {
  authCode: string;
  redirectUri?: string;
}): Promise<TiktokTokenExchangeResult> {
  const { appId, appSecret } = getTiktokAppCredentials();
  if (!appId || !appSecret) {
    throw new Error("缺少 TikTok App 凭证：请配置 TIKTOK_APP_ID / TIKTOK_APP_SECRET");
  }
  const body = {
    app_id: appId,
    secret: appSecret,
    auth_code: params.authCode,
  };
  const response = await fetch(TIKTOK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `TikTok token exchange failed: HTTP ${response.status} ${text.slice(0, 200)}`,
    );
  }
  const json = JSON.parse(text) as {
    code?: number;
    message?: string;
    data?: {
      access_token?: string;
      refresh_token?: string;
      advertiser_ids?: Array<string | number>;
    };
  };
  if (json.code !== 0 || !json.data?.access_token) {
    throw new Error(
      json.message || "TikTok token exchange returned no access_token",
    );
  }

  let advertiserIds = (json.data.advertiser_ids ?? []).map(String).filter(Boolean);
  if (advertiserIds.length === 0) {
    advertiserIds = await listAuthorizedAdvertiserIds({
      accessToken: json.data.access_token,
    });
  }

  return {
    accessToken: json.data.access_token,
    refreshToken: json.data.refresh_token,
    advertiserIds,
  };
}

/** 当 token 响应未带 advertiser_ids 时，用授权列表接口补齐。 */
export async function listAuthorizedAdvertiserIds(params: {
  accessToken: string;
}): Promise<string[]> {
  const { appId, appSecret } = getTiktokAppCredentials();
  const url = new URL(`${TIKTOK_API_BASE}/oauth2/advertiser/get/`);
  url.searchParams.set("app_id", appId);
  url.searchParams.set("secret", appSecret);
  const response = await fetch(url.toString(), {
    headers: { "Access-Token": params.accessToken },
  });
  const json = (await response.json().catch(() => ({}))) as {
    code?: number;
    message?: string;
    data?: {
      list?: Array<{ advertiser_id?: string | number }>;
    };
  };
  if (!response.ok || (json.code !== undefined && json.code !== 0)) {
    throw new Error(json.message || `HTTP ${response.status}`);
  }
  return (json.data?.list ?? [])
    .map((item) => String(item.advertiser_id ?? "").trim())
    .filter(Boolean);
}

/**
 * 列举当前 token 可访问的 Business Center ID。
 * Catalog API（catalog/get 等）强制要求 bc_id。
 */
export async function listAccessibleBcIds(params: {
  accessToken: string;
}): Promise<string[]> {
  try {
    const url = new URL(`${TIKTOK_API_BASE}/bc/get/`);
    url.searchParams.set("page", "1");
    url.searchParams.set("page_size", "50");
    const response = await fetch(url.toString(), {
      headers: { "Access-Token": params.accessToken },
    });
    const json = (await response.json().catch(() => ({}))) as {
      code?: number;
      message?: string;
      data?: {
        list?: Array<{ bc_id?: string | number; bc_info?: { bc_id?: string | number } }>;
      };
    };
    if (!response.ok || (json.code !== undefined && json.code !== 0)) {
      throw new Error(json.message || `HTTP ${response.status}`);
    }
    return (json.data?.list ?? [])
      .map((item) =>
        String(item.bc_id ?? item.bc_info?.bc_id ?? "").trim(),
      )
      .filter(Boolean);
  } catch (e) {
    throw new Error(formatOutboundNetworkError(e));
  }
}

/** List product catalogs under a Business Center（必须传 bc_id）。 */
export async function getTiktokCatalogs(params: {
  accessToken: string;
  bcId: string;
  advertiserId: string;
}): Promise<TiktokCatalogInfo[]> {
  try {
    const url = new URL(`${TIKTOK_API_BASE}/catalog/get/`);
    url.searchParams.set("bc_id", params.bcId);
    url.searchParams.set("page", "1");
    url.searchParams.set("page_size", "100");
    const response = await fetch(url.toString(), {
      headers: { "Access-Token": params.accessToken },
    });
    const json = (await response.json().catch(() => ({}))) as {
      code?: number;
      message?: string;
      data?: {
        list?: RawTiktokCatalogRow[];
        catalogs?: RawTiktokCatalogRow[];
      };
    };
    if (!response.ok || (json.code !== undefined && json.code !== 0)) {
      throw new Error(json.message || `HTTP ${response.status}`);
    }
    const rows = json.data?.list ?? json.data?.catalogs ?? [];
    return rows
      .map((c) =>
        mapRawTiktokCatalogRow(c, {
          bcId: params.bcId,
          advertiserId: params.advertiserId,
        }),
      )
      .filter((c): c is TiktokCatalogInfo => Boolean(c));
  } catch (e) {
    throw new Error(formatOutboundNetworkError(e));
  }
}

/**
 * 按授权广告主汇总 Catalog：先查可访问 BC，再对每个 bc_id 调 catalog/get。
 * advertiserIds 用于商品写入等仍依赖 advertiser_id 的接口（取第一个作为默认）。
 */
export async function getTiktokCatalogsForAdvertisers(params: {
  accessToken: string;
  advertiserIds: string[];
}): Promise<TiktokCatalogInfo[]> {
  const advertiserId = params.advertiserIds[0]?.trim();
  if (!advertiserId) return [];

  const bcIds = await listAccessibleBcIds({ accessToken: params.accessToken });
  if (bcIds.length === 0) {
    throw new Error(
      "该 TikTok 账号未关联任何 Business Center（bc_id）。请先在 TikTok for Business 创建或加入商务中心后再授权。",
    );
  }

  const out: TiktokCatalogInfo[] = [];
  const seen = new Set<string>();
  const errors: string[] = [];

  for (const bcId of bcIds) {
    try {
      const catalogs = await getTiktokCatalogs({
        accessToken: params.accessToken,
        bcId,
        advertiserId,
      });
      for (const catalog of catalogs) {
        const key = `${catalog.bcId}:${catalog.catalogId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(catalog);
      }
    } catch (e) {
      errors.push(`${bcId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (out.length === 0 && errors.length > 0) {
    throw new Error(`拉取 TikTok Catalog 失败：${errors[0]}`);
  }
  return out;
}
