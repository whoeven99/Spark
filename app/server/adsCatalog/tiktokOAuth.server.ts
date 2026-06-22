import crypto from "node:crypto";
import { formatOutboundNetworkError } from "../common/outboundError.server";
import {
  buildShopifyAdminHostParam,
  buildAdminEmbeddedAppReturnUrl,
} from "../billing/buildBillingReturnUrl.server";

export const TIKTOK_OAUTH_BASE = "https://ads.tiktok.com/marketing_api/auth";
export const TIKTOK_TOKEN_URL =
  "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/";
export const TIKTOK_API_BASE = "https://business-api.tiktok.com/open_api/v1.3";

/** 商品 Catalog 同步所需权限。 */
export const TIKTOK_CATALOG_SCOPE = "catalog";

export const TIKTOK_CATALOG_CALLBACK_PATH = "/ads/tiktok-catalog/callback";

export interface TiktokCatalogInfo {
  catalogId: string;
  catalogName?: string;
  advertiserId: string;
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

/** Build the TikTok consent screen URL. */
export function buildTiktokAuthUrl(params: {
  appId: string;
  state: string;
  redirectUri: string;
}): string {
  const query = new URLSearchParams({
    app_id: params.appId,
    redirect_uri: params.redirectUri,
    state: params.state,
    scope: TIKTOK_CATALOG_SCOPE,
  });
  return `${TIKTOK_OAUTH_BASE}?${query.toString()}`;
}

/** 在嵌入式 iframe 内通过 API 鉴权后生成 TikTok 授权 URL。 */
export function buildTiktokOAuthStartUrl(params: {
  shop: string;
  host?: string;
  requestOrigin: string;
}): { ok: true; authUrl: string } | { ok: false; error: string } {
  const { appId } = getTiktokAppCredentials();
  if (!appId) {
    return {
      ok: false,
      error: "缺少 TikTok App 凭证：请配置 TIKTOK_APP_ID / TIKTOK_APP_SECRET 环境变量",
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

/** Exchange an authorization code for an access token and advertiser IDs. */
export async function exchangeTiktokAuthCode(params: {
  authCode: string;
  redirectUri?: string;
}): Promise<{ accessToken: string; advertiserIds: string[] }> {
  const { appId, appSecret } = getTiktokAppCredentials();
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
      advertiser_ids?: string[];
    };
  };
  if (json.code !== 0 || !json.data?.access_token) {
    throw new Error(
      json.message || "TikTok token exchange returned no access_token",
    );
  }
  return {
    accessToken: json.data.access_token,
    advertiserIds: json.data.advertiser_ids ?? [],
  };
}

/** List product catalogs accessible to a given advertiser account. */
export async function getTiktokCatalogs(params: {
  accessToken: string;
  advertiserId: string;
}): Promise<TiktokCatalogInfo[]> {
  try {
    const url = new URL(`${TIKTOK_API_BASE}/catalog/get/`);
    url.searchParams.set("advertiser_id", params.advertiserId);
    const response = await fetch(url.toString(), {
      headers: { "Access-Token": params.accessToken },
    });
    const json = (await response.json().catch(() => ({}))) as {
      code?: number;
      message?: string;
      data?: {
        catalogs?: Array<{ catalog_id?: string; catalog_name?: string }>;
      };
    };
    if (!response.ok || (json.code !== undefined && json.code !== 0)) {
      throw new Error(json.message || `HTTP ${response.status}`);
    }
    return (json.data?.catalogs ?? [])
      .filter((c) => c.catalog_id)
      .map((c) => ({
        catalogId: c.catalog_id!,
        catalogName: c.catalog_name,
        advertiserId: params.advertiserId,
      }));
  } catch (e) {
    throw new Error(formatOutboundNetworkError(e));
  }
}
