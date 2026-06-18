import crypto from "node:crypto";
import { formatOutboundNetworkError } from "../common/outboundError.server";
import {
  buildShopifyAdminHostParam,
  buildAdminEmbeddedAppReturnUrl,
} from "../billing/buildBillingReturnUrl.server";
import { getAdProviderCredential } from "../adsCredentialStore.server";

export const META_GRAPH_VERSION = "v19.0";
export const META_OAUTH_DIALOG = `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`;
export const META_TOKEN_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`;
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

/** Catalog 同步 + 列举 Business/Catalog 所需权限。生产环境需通过 Meta App Review。 */
export const META_CATALOG_SCOPE = "catalog_management,business_management";

export const META_CATALOG_CALLBACK_PATH = "/ads/meta-catalog/callback";

export interface MetaOAuthClient {
  appId: string;
  appSecret: string;
}

export interface MetaCatalogAccount {
  catalogId: string;
  name?: string;
  businessId?: string;
}

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * Resolve the Meta OAuth app credentials. Prefers app-level env vars
 * (META_APP_ID / META_APP_SECRET) so a single Spark Meta App serves all shops,
 * mirroring the Google flow. Falls back to a per-shop saved Meta config for
 * backwards compatibility with the legacy app.ads.meta.config flow.
 */
export async function resolveMetaOAuthClient(
  shop?: string,
): Promise<MetaOAuthClient | null> {
  const appId = readEnv("META_APP_ID") || readEnv("META_OAUTH_CLIENT_ID");
  const appSecret = readEnv("META_APP_SECRET") || readEnv("META_OAUTH_CLIENT_SECRET");
  if (appId && appSecret) return { appId, appSecret };

  if (shop) {
    const perShop = await getAdProviderCredential(shop, "meta");
    if (perShop?.clientId && perShop.clientSecret) {
      return { appId: perShop.clientId, appSecret: perShop.clientSecret };
    }
  }
  return null;
}

/** Resolve the absolute redirect URI for the Meta OAuth callback path. */
export function getMetaRedirectUri(path: string, requestOrigin?: string): string {
  const base =
    readEnv("META_OAUTH_REDIRECT_BASE") ||
    readEnv("SHOPIFY_APP_URL") ||
    requestOrigin;
  if (!base) {
    throw new Error(
      "无法解析 Meta OAuth redirect_uri：请配置 SHOPIFY_APP_URL 或 META_OAUTH_REDIRECT_BASE",
    );
  }
  return `${base.replace(/\/$/, "")}${path}`;
}

/** Meta OAuth 完成后跳回嵌入式应用（优先 admin.shopify.com，避免 shop: null）。 */
export function buildMetaOAuthReturnUrl(params: {
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
    readEnv("META_OAUTH_REDIRECT_BASE") ||
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
  return process.env.SHOPIFY_API_SECRET || "spark-meta-oauth";
}

export function createMetaOAuthState(
  shop: string,
  host = "",
  appOrigin = "",
): string {
  const payload = JSON.stringify({
    shop,
    flow: "meta_catalog",
    host,
    appOrigin: appOrigin.replace(/\/$/, ""),
    nonce: crypto.randomBytes(8).toString("hex"),
    ts: Date.now(),
  });
  const encoded = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", stateSecret()).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyMetaOAuthState(
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
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
      shop?: string;
      flow?: string;
      host?: string;
      appOrigin?: string;
      ts?: number;
    };
    if (!payload.shop || payload.flow !== "meta_catalog") return null;
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

/** Build the Meta consent screen URL. */
export function buildMetaAuthUrl(params: {
  appId: string;
  state: string;
  redirectUri: string;
}): string {
  const query = new URLSearchParams({
    client_id: params.appId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: META_CATALOG_SCOPE,
    state: params.state,
  });
  return `${META_OAUTH_DIALOG}?${query.toString()}`;
}

/** 在嵌入式 iframe 内通过 API 鉴权后生成 Meta 授权 URL。 */
export async function buildMetaOAuthStartUrl(params: {
  shop: string;
  host?: string;
  requestOrigin: string;
}): Promise<{ ok: true; authUrl: string } | { ok: false; error: string }> {
  const client = await resolveMetaOAuthClient(params.shop);
  if (!client) {
    return {
      ok: false,
      error: "缺少 Meta App 凭证：请配置 META_APP_ID / META_APP_SECRET 环境变量",
    };
  }
  const appOrigin = (readEnv("SHOPIFY_APP_URL") || params.requestOrigin).replace(/\/$/, "");
  const state = createMetaOAuthState(params.shop, params.host ?? "", appOrigin);
  const authUrl = buildMetaAuthUrl({
    appId: client.appId,
    state,
    redirectUri: getMetaRedirectUri(META_CATALOG_CALLBACK_PATH, params.requestOrigin),
  });
  return { ok: true, authUrl };
}

/** Exchange an authorization code for a short-lived user access token. */
export async function exchangeMetaCodeForToken(params: {
  code: string;
  redirectUri: string;
  client: MetaOAuthClient;
}): Promise<string> {
  const url = new URL(META_TOKEN_URL);
  url.searchParams.set("client_id", params.client.appId);
  url.searchParams.set("client_secret", params.client.appSecret);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("code", params.code);

  const response = await fetch(url.toString());
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Meta token exchange failed: HTTP ${response.status} ${text.slice(0, 200)}`);
  }
  const json = JSON.parse(text) as { access_token?: string; error?: { message?: string } };
  if (!json.access_token) {
    throw new Error(json.error?.message || "Meta token exchange returned no access_token");
  }
  return json.access_token;
}

/** Exchange a short-lived token for a long-lived (~60 day) token. */
export async function exchangeForLongLivedMetaToken(params: {
  shortToken: string;
  client: MetaOAuthClient;
}): Promise<string> {
  const url = new URL(META_TOKEN_URL);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", params.client.appId);
  url.searchParams.set("client_secret", params.client.appSecret);
  url.searchParams.set("fb_exchange_token", params.shortToken);

  const response = await fetch(url.toString());
  const text = await response.text();
  if (!response.ok) {
    // Fall back to the short-lived token rather than failing the whole flow.
    return params.shortToken;
  }
  const json = JSON.parse(text) as { access_token?: string };
  return json.access_token || params.shortToken;
}

interface BusinessNode {
  id?: string;
  name?: string;
  owned_product_catalogs?: { data?: Array<{ id?: string; name?: string }> };
  client_product_catalogs?: { data?: Array<{ id?: string; name?: string }> };
}

/**
 * List all product catalogs the authorized user can manage, across the
 * businesses they own or have client access to.
 */
export async function getMetaCatalogs(accessToken: string): Promise<MetaCatalogAccount[]> {
  try {
    const url = new URL(`${META_GRAPH_BASE}/me/businesses`);
    url.searchParams.set(
      "fields",
      "id,name,owned_product_catalogs{id,name},client_product_catalogs{id,name}",
    );
    url.searchParams.set("limit", "100");
    url.searchParams.set("access_token", accessToken);

    const response = await fetch(url.toString());
    const json = (await response.json().catch(() => ({}))) as {
      data?: BusinessNode[];
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(json.error?.message || `HTTP ${response.status}`);
    }

    const out: MetaCatalogAccount[] = [];
    const seen = new Set<string>();
    for (const biz of json.data ?? []) {
      const businessId = biz.id;
      const catalogs = [
        ...(biz.owned_product_catalogs?.data ?? []),
        ...(biz.client_product_catalogs?.data ?? []),
      ];
      for (const cat of catalogs) {
        if (!cat.id || seen.has(cat.id)) continue;
        seen.add(cat.id);
        out.push({ catalogId: cat.id, name: cat.name, businessId });
      }
    }
    return out;
  } catch (e) {
    throw new Error(formatOutboundNetworkError(e));
  }
}
