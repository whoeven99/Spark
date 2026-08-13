import crypto from "node:crypto";
import { formatOutboundNetworkError } from "../common/outboundError.server";
import {
  buildShopifyAdminHostParam,
  buildAdminEmbeddedAppReturnUrl,
} from "../billing/buildBillingReturnUrl.server";

export const META_GRAPH_VERSION = "v19.0";
export const META_OAUTH_DIALOG = `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`;
export const META_TOKEN_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`;
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

/** Catalog 同步 + 列举 Business/Catalog 所需权限。生产环境需通过 Meta App Review。 */
export const META_CATALOG_SCOPE = "catalog_management,business_management";

/**
 * Marketing API：Insights 读取 + 广告创建/编辑 + 列举可用 Facebook Page。
 * 生产环境需通过 Meta App Review（ads_management / pages_show_list）。
 */
export const META_ADS_SCOPE =
  "ads_read,ads_management,business_management,pages_show_list";

export const META_CATALOG_CALLBACK_PATH = "/ads/meta-catalog/callback";
export const META_ADS_CALLBACK_PATH = "/ads/meta-ads/callback";
export const META_PIXEL_DATA_CALLBACK_PATH = "/ads/meta-pixel-data/callback";
export const META_CAPI_CALLBACK_PATH = "/ads/meta-capi/callback";
export const META_UNIFIED_CALLBACK_PATH = "/ads/meta-unified/callback";

export type MetaOAuthFlow =
  | "meta_catalog"
  | "meta_ads"
  | "meta_pixel_data"
  | "meta_capi"
  | "meta_unified";

export interface MetaOAuthClient {
  appId: string;
  appSecret: string;
}

export interface MetaCatalogAccount {
  catalogId: string;
  name?: string;
  businessId?: string;
}

export interface MetaAdAccount {
  /** Graph id，通常形如 act_123 */
  adAccountId: string;
  name?: string;
  currencyCode?: string;
  accountStatus?: number;
}

export interface MetaPage {
  /** Facebook Page Graph ID */
  pageId: string;
  name?: string;
}

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * Resolve Meta OAuth app credentials from env only
 * (`META_APP_ID` / `META_APP_SECRET`, with OAuth alias fallbacks).
 */
export function resolveMetaOAuthClient(): MetaOAuthClient | null {
  const appId = readEnv("META_APP_ID") || readEnv("META_OAUTH_CLIENT_ID");
  const appSecret = readEnv("META_APP_SECRET") || readEnv("META_OAUTH_CLIENT_SECRET");
  if (appId && appSecret) return { appId, appSecret };
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
  flow: MetaOAuthFlow = "meta_catalog",
  popup = false,
): string {
  const payload = JSON.stringify({
    shop,
    flow,
    host,
    appOrigin: appOrigin.replace(/\/$/, ""),
    nonce: crypto.randomBytes(8).toString("hex"),
    ts: Date.now(),
    ...(popup ? { popup: true } : {}),
  });
  const encoded = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", stateSecret()).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyMetaOAuthState(
  state: string,
  maxAgeMs = 15 * 60 * 1000,
  expectedFlow?: MetaOAuthFlow,
): { shop: string; host: string; appOrigin: string; flow: MetaOAuthFlow; popup: boolean } | null {
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
      popup?: boolean;
    };
    if (!payload.shop) return null;
    const flow = payload.flow as MetaOAuthFlow | undefined;
    if (
      flow !== "meta_catalog" &&
      flow !== "meta_ads" &&
      flow !== "meta_pixel_data" &&
      flow !== "meta_capi"
    ) {
      return null;
    }
    if (expectedFlow && flow !== expectedFlow) return null;
    if (typeof payload.ts !== "number" || Date.now() - payload.ts > maxAgeMs) return null;
    return {
      shop: payload.shop,
      host: payload.host ?? "",
      appOrigin: payload.appOrigin ?? "",
      flow,
      popup: payload.popup === true,
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
  scope?: string;
}): string {
  const query = new URLSearchParams({
    client_id: params.appId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: params.scope ?? META_CATALOG_SCOPE,
    state: params.state,
  });
  return `${META_OAUTH_DIALOG}?${query.toString()}`;
}

/** Facebook Login for Business — Conversions API Integration Configuration ID。 */
export function resolveMetaCapiLoginConfigId(): string | null {
  const configId = readEnv("META_CAPI_LOGIN_CONFIG_ID");
  return configId || null;
}

export function isMetaCapiBisuOnboardingConfigured(): boolean {
  return Boolean(resolveMetaCapiLoginConfigId());
}

/**
 * Business Login for CAPI：使用 config_id，不传 scope。
 * @see https://developers.facebook.com/docs/facebook-login/facebook-login-for-business
 */
export function buildMetaCapiBusinessAuthUrl(params: {
  appId: string;
  state: string;
  redirectUri: string;
  configId: string;
}): string {
  const query = new URLSearchParams({
    client_id: params.appId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    state: params.state,
    config_id: params.configId,
  });
  return `${META_OAUTH_DIALOG}?${query.toString()}`;
}

/** 在嵌入式 iframe 内通过 API 鉴权后生成 Meta Catalog 授权 URL。 */
export async function buildMetaOAuthStartUrl(params: {
  shop: string;
  host?: string;
  requestOrigin: string;
  popup?: boolean;
}): Promise<{ ok: true; authUrl: string } | { ok: false; error: string }> {
  const client = resolveMetaOAuthClient();
  if (!client) {
    return {
      ok: false,
      error: "缺少 Meta App 凭证：请配置 META_APP_ID / META_APP_SECRET 环境变量",
    };
  }
  const appOrigin = (readEnv("SHOPIFY_APP_URL") || params.requestOrigin).replace(/\/$/, "");
  const state = createMetaOAuthState(
    params.shop,
    params.host ?? "",
    appOrigin,
    "meta_catalog",
    params.popup,
  );
  const authUrl = buildMetaAuthUrl({
    appId: client.appId,
    state,
    redirectUri: getMetaRedirectUri(META_CATALOG_CALLBACK_PATH, params.requestOrigin),
    scope: META_CATALOG_SCOPE,
  });
  return { ok: true, authUrl };
}

/** Meta Pixel 数据页手动拉数测试 OAuth（独立凭证，回跳数据页）。 */
export async function buildMetaPixelDataOAuthStartUrl(params: {
  shop: string;
  host?: string;
  requestOrigin: string;
  popup?: boolean;
}): Promise<{ ok: true; authUrl: string } | { ok: false; error: string }> {
  const client = resolveMetaOAuthClient();
  if (!client) {
    return {
      ok: false,
      error: "缺少 Meta App 凭证：请配置 META_APP_ID / META_APP_SECRET 环境变量",
    };
  }
  const appOrigin = (readEnv("SHOPIFY_APP_URL") || params.requestOrigin).replace(/\/$/, "");
  const state = createMetaOAuthState(
    params.shop,
    params.host ?? "",
    appOrigin,
    "meta_pixel_data",
    params.popup,
  );
  const authUrl = buildMetaAuthUrl({
    appId: client.appId,
    state,
    redirectUri: getMetaRedirectUri(META_PIXEL_DATA_CALLBACK_PATH, params.requestOrigin),
    scope: META_ADS_SCOPE,
  });
  return { ok: true, authUrl };
}

/** Meta Pixel 数据页手动 OAuth 完成后跳回数据页。 */
export function buildMetaPixelDataOAuthReturnUrl(params: {
  shop: string;
  host?: string;
  appOrigin?: string;
  query?: Record<string, string>;
  request?: Request;
}): string {
  const adminUrl = buildAdminEmbeddedAppReturnUrl({
    path: "/app/ads/meta-pixel/data",
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
  const target = new URL("/app/ads/meta-pixel/data", base.replace(/\/$/, "") || base);
  target.searchParams.set("shop", params.shop);
  target.searchParams.set("embedded", "1");
  target.searchParams.set("host", params.host || buildShopifyAdminHostParam(params.shop));
  for (const [key, value] of Object.entries(params.query ?? {})) {
    target.searchParams.set(key, value);
  }
  return target.toString();
}

/** Meta Ads（Marketing API）独立授权入口。 */
export async function buildMetaAdsOAuthStartUrl(params: {
  shop: string;
  host?: string;
  requestOrigin: string;
  popup?: boolean;
}): Promise<{ ok: true; authUrl: string } | { ok: false; error: string }> {
  const client = resolveMetaOAuthClient();
  if (!client) {
    return {
      ok: false,
      error: "缺少 Meta App 凭证：请配置 META_APP_ID / META_APP_SECRET 环境变量",
    };
  }
  const appOrigin = (readEnv("SHOPIFY_APP_URL") || params.requestOrigin).replace(/\/$/, "");
  const state = createMetaOAuthState(
    params.shop,
    params.host ?? "",
    appOrigin,
    "meta_ads",
    params.popup,
  );
  const authUrl = buildMetaAuthUrl({
    appId: client.appId,
    state,
    redirectUri: getMetaRedirectUri(META_ADS_CALLBACK_PATH, params.requestOrigin),
    scope: META_ADS_SCOPE,
  });
  return { ok: true, authUrl };
}

/** Meta Ads OAuth 完成后跳回广告洞察页。 */
export function buildMetaAdsOAuthReturnUrl(params: {
  shop: string;
  host?: string;
  appOrigin?: string;
  query?: Record<string, string>;
  request?: Request;
}): string {
  const adminUrl = buildAdminEmbeddedAppReturnUrl({
    path: "/app/insights/performance",
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
  const target = new URL("/app/insights/performance", base.replace(/\/$/, "") || base);
  target.searchParams.set("shop", params.shop);
  target.searchParams.set("embedded", "1");
  target.searchParams.set("host", params.host || buildShopifyAdminHostParam(params.shop));
  for (const [key, value] of Object.entries(params.query ?? {})) {
    target.searchParams.set(key, value);
  }
  return target.toString();
}

/** Meta CAPI（Business Integration System User）OAuth 入口。 */
export async function buildMetaCapiOAuthStartUrl(params: {
  shop: string;
  host?: string;
  requestOrigin: string;
  popup?: boolean;
}): Promise<{ ok: true; authUrl: string } | { ok: false; error: string }> {
  const client = resolveMetaOAuthClient();
  if (!client) {
    return {
      ok: false,
      error: "缺少 Meta App 凭证：请配置 META_APP_ID / META_APP_SECRET 环境变量",
    };
  }
  const configId = resolveMetaCapiLoginConfigId();
  if (!configId) {
    return {
      ok: false,
      error: "缺少 Meta CAPI Configuration：请配置 META_CAPI_LOGIN_CONFIG_ID 环境变量",
    };
  }
  const appOrigin = (readEnv("SHOPIFY_APP_URL") || params.requestOrigin).replace(/\/$/, "");
  const state = createMetaOAuthState(
    params.shop,
    params.host ?? "",
    appOrigin,
    "meta_capi",
    params.popup,
  );
  const authUrl = buildMetaCapiBusinessAuthUrl({
    appId: client.appId,
    state,
    redirectUri: getMetaRedirectUri(META_CAPI_CALLBACK_PATH, params.requestOrigin),
    configId,
  });
  return { ok: true, authUrl };
}

/** Meta 统一授权入口：一次 Business Login 同时用于 Catalog、Ads 和 CAPI。 */
export async function buildMetaUnifiedOAuthStartUrl(params: {
  shop: string;
  host?: string;
  requestOrigin: string;
  popup?: boolean;
}): Promise<{ ok: true; authUrl: string } | { ok: false; error: string }> {
  const client = resolveMetaOAuthClient();
  if (!client) {
    return {
      ok: false,
      error: "缺少 Meta App 凭证：请配置 META_APP_ID / META_APP_SECRET 环境变量",
    };
  }
  const configId = resolveMetaCapiLoginConfigId();
  if (!configId) {
    return {
      ok: false,
      error: "缺少 Meta CAPI Configuration：请配置 META_CAPI_LOGIN_CONFIG_ID 环境变量",
    };
  }
  const appOrigin = (readEnv("SHOPIFY_APP_URL") || params.requestOrigin).replace(/\/$/, "");
  const state = createMetaOAuthState(
    params.shop,
    params.host ?? "",
    appOrigin,
    "meta_unified",
    params.popup,
  );
  const authUrl = buildMetaCapiBusinessAuthUrl({
    appId: client.appId,
    state,
    redirectUri: getMetaRedirectUri(META_UNIFIED_CALLBACK_PATH, params.requestOrigin),
    configId,
  });
  return { ok: true, authUrl };
}

/** Meta CAPI OAuth 完成后跳回 Ads Catalog。 */
export function buildMetaCapiOAuthReturnUrl(params: {
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

export function buildMetaUnifiedOAuthReturnUrl(params: {
  shop: string;
  host?: string;
  appOrigin?: string;
  query?: Record<string, string>;
  request?: Request;
}): string {
  const adminUrl = buildAdminEmbeddedAppReturnUrl({
    path: "/app/ads-catalog",
    shop: params.shop,
    query: params.query,
    request: params.request,
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

/**
 * 列举当前用户可管理的 Facebook Page（广告创意 object_story_spec.page_id 所需）。
 * @see https://developers.facebook.com/docs/graph-api/reference/user/accounts/
 */
export async function getMetaPages(accessToken: string): Promise<MetaPage[]> {
  try {
    const out: MetaPage[] = [];
    let nextUrl: string | null = null;

    {
      const url = new URL(`${META_GRAPH_BASE}/me/accounts`);
      url.searchParams.set("fields", "id,name");
      url.searchParams.set("limit", "100");
      url.searchParams.set("access_token", accessToken);
      nextUrl = url.toString();
    }

    let pages = 0;
    while (nextUrl && pages < 10) {
      pages += 1;
      const response = await fetch(nextUrl);
      const json = (await response.json().catch(() => ({}))) as {
        data?: Array<{ id?: string; name?: string }>;
        paging?: { next?: string };
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(json.error?.message || `HTTP ${response.status}`);
      }
      for (const row of json.data ?? []) {
        const pageId = (row.id ?? "").trim();
        if (!pageId) continue;
        out.push({ pageId, name: row.name });
      }
      nextUrl = json.paging?.next ?? null;
    }
    return out;
  } catch (e) {
    throw new Error(formatOutboundNetworkError(e));
  }
}

/**
 * 列举当前用户可访问的广告账户。
 * @see https://developers.facebook.com/docs/marketing-api/reference/user/adaccounts/
 */
export async function getMetaAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  try {
    const out: MetaAdAccount[] = [];
    let nextUrl: string | null = null;

    {
      const url = new URL(`${META_GRAPH_BASE}/me/adaccounts`);
      url.searchParams.set("fields", "id,name,account_id,currency,account_status");
      url.searchParams.set("limit", "100");
      url.searchParams.set("access_token", accessToken);
      nextUrl = url.toString();
    }

    let pages = 0;
    while (nextUrl && pages < 10) {
      pages += 1;
      const response = await fetch(nextUrl);
      const json = (await response.json().catch(() => ({}))) as {
        data?: Array<{
          id?: string;
          name?: string;
          account_id?: string;
          currency?: string;
          account_status?: number;
        }>;
        paging?: { next?: string };
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(json.error?.message || `HTTP ${response.status}`);
      }
      for (const row of json.data ?? []) {
        const adAccountId = (row.id || (row.account_id ? `act_${row.account_id}` : "")).trim();
        if (!adAccountId) continue;
        out.push({
          adAccountId,
          name: row.name,
          currencyCode: row.currency,
          accountStatus: row.account_status,
        });
      }
      nextUrl = json.paging?.next ?? null;
    }
    return out;
  } catch (e) {
    throw new Error(formatOutboundNetworkError(e));
  }
}
