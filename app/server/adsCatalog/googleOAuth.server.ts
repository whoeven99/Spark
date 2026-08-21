import crypto from "node:crypto";
import { formatOutboundNetworkError } from "../common/outboundError.server";
import { buildShopifyAdminHostParam, buildAdminEmbeddedAppReturnUrl } from "../billing/buildBillingReturnUrl.server";
import {
  listSelectableAdsCustomers,
} from "./googleAdsApi.server";
import { listGoogleMerchantAccounts } from "./clients/googleMerchantClient.server";

export { googleAdsApiUrl, GOOGLE_ADS_API_VERSION } from "./googleAdsApi.server";

export const GOOGLE_OAUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const GMC_SCOPE = "https://www.googleapis.com/auth/content";
export const ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export type OAuthFlow = "gmc" | "ads" | "gmc_ads" | "ads_sandbox" | "gsc" | "ga4";

const VALID_OAUTH_FLOWS: ReadonlySet<OAuthFlow> = new Set([
  "gmc",
  "ads",
  "gmc_ads",
  "ads_sandbox",
  "gsc",
  "ga4",
]);

/** Catalog 支持一次组合授权，也支持 GMC / Ads 单独授权。 */
export function normalizeCatalogGoogleOAuthFlow(
  flow: OAuthFlow,
): "gmc" | "ads" | "gmc_ads" | "ads_sandbox" | "gsc" | "ga4" {
  return flow;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  scope?: string;
}

export interface MerchantAccount {
  merchantId: string;
  name?: string;
}

export interface AdsCustomer {
  /** Plain customer id (digits only), e.g. "1234567890". */
  customerId: string;
  /** Hyphenated form for display, e.g. "123-456-7890". */
  formatted: string;
  /** Optional account descriptive name from Google Ads. */
  descriptiveName?: string;
  /** login-customer-id to use when querying this account (MCC id for child accounts). */
  loginCustomerId?: string;
}

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function getGoogleOAuthClient(): { clientId: string; clientSecret: string } {
  return {
    clientId: readEnv("GOOGLE_OAUTH_CLIENT_ID"),
    clientSecret: readEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
  };
}

export function getGoogleAdsDeveloperToken(): string {
  return readEnv("GOOGLE_ADS_DEVELOPER_TOKEN");
}

/** Resolve the absolute redirect URI for a given OAuth callback path. */
export function getRedirectUri(path: string, requestOrigin?: string): string {
  const base =
    readEnv("GOOGLE_OAUTH_REDIRECT_BASE") ||
    readEnv("SHOPIFY_APP_URL") ||
    requestOrigin;
  if (!base) {
    throw new Error("无法解析 Google OAuth redirect_uri：请配置 SHOPIFY_APP_URL 或 GOOGLE_OAUTH_REDIRECT_BASE");
  }
  return `${base.replace(/\/$/, "")}${path}`;
}

/** Google OAuth 完成后跳回嵌入式应用（优先 admin.shopify.com，避免 shop: null）。 */
export function buildGoogleOAuthReturnUrl(params: {
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
    readEnv("GOOGLE_OAUTH_REDIRECT_BASE") ||
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
// state = base64url(payload) + "." + hmacSHA256(payload). The HMAC key is the
// Shopify API secret, so the callback can verify the request originated from us
// without server-side session storage.

function stateSecret(): string {
  return process.env.SHOPIFY_API_SECRET || "spark-google-oauth";
}

export function createOAuthState(
  shop: string,
  flow: OAuthFlow,
  host = "",
  appOrigin = "",
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

export function verifyOAuthState(
  state: string,
  maxAgeMs = 15 * 60 * 1000,
): { shop: string; flow: OAuthFlow; host: string; appOrigin: string; popup: boolean } | null {
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
      flow?: OAuthFlow;
      host?: string;
      appOrigin?: string;
      ts?: number;
      popup?: boolean;
    };
    if (
      !payload.shop ||
      !payload.flow ||
      !VALID_OAUTH_FLOWS.has(payload.flow)
    ) {
      return null;
    }
    if (typeof payload.ts !== "number" || Date.now() - payload.ts > maxAgeMs) return null;
    return {
      shop: payload.shop,
      flow: payload.flow,
      host: payload.host ?? "",
      appOrigin: payload.appOrigin ?? "",
      popup: payload.popup === true,
    };
  } catch {
    return null;
  }
}

/** Build the Google consent screen URL for the given flow. */
export function buildAuthUrl(params: {
  flow: OAuthFlow;
  state: string;
  redirectUri: string;
  /** 更换账户 / 重新授权时强制弹出 Google 账号选择。 */
  reauth?: boolean;
}): string {
  const { clientId } = getGoogleOAuthClient();
  const scope =
    params.flow === "gmc" ? GMC_SCOPE :
    params.flow === "gmc_ads" ? `${GMC_SCOPE} ${ADS_SCOPE}` :
    params.flow === "gsc" ? GSC_SCOPE :
    params.flow === "ga4" ? GA4_SCOPE :
    ADS_SCOPE;
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: params.reauth ? "consent select_account" : "consent",
    state: params.state,
  });
  return `${GOOGLE_OAUTH_BASE}?${query.toString()}`;
}

/** 在嵌入式 iframe 内通过 API 鉴权后生成 Google 授权 URL（避免 _top 跳转丢失 session）。 */
export function buildGoogleOAuthStartUrl(params: {
  flow: OAuthFlow;
  shop: string;
  host?: string;
  requestOrigin: string;
  reauth?: boolean;
  popup?: boolean;
}): { ok: true; authUrl: string } | { ok: false; error: string } {
  const { clientId } = getGoogleOAuthClient();
  if (!clientId) {
    return { ok: false, error: "缺少 GOOGLE_OAUTH_CLIENT_ID 环境变量" };
  }

  // 生产 Catalog 的组合授权与单侧授权共用 Merchant callback；沙盒仍走独立 Ads callback。
  const flow = normalizeCatalogGoogleOAuthFlow(params.flow);
  const callbackPath =
    flow === "gmc" || flow === "ads" || flow === "gmc_ads"
      ? "/ads/google-merchant/callback"
      : "/ads/google-ads/callback";
  const appOrigin = (readEnv("SHOPIFY_APP_URL") || params.requestOrigin).replace(/\/$/, "");
  const state = createOAuthState(
    params.shop,
    flow,
    params.host ?? "",
    appOrigin,
    params.popup,
  );
  const authUrl = buildAuthUrl({
    flow,
    state,
    redirectUri: getRedirectUri(callbackPath, params.requestOrigin),
    reauth: params.reauth,
  });
  return { ok: true, authUrl };
}

/** Catalog 页主入口：一次授权 GMC + Ads。 */
export function buildGoogleCombinedOAuthStartUrl(params: {
  shop: string;
  host?: string;
  requestOrigin: string;
  reauth?: boolean;
  popup?: boolean;
}): { ok: true; authUrl: string } | { ok: false; error: string } {
  return buildGoogleOAuthStartUrl({ ...params, flow: "gmc_ads" });
}

/** Google Ads 测试账号 OAuth（广告洞察沙盒，与 Catalog 生产授权隔离）。 */
export function buildGoogleAdsSandboxOAuthStartUrl(params: {
  shop: string;
  host?: string;
  requestOrigin: string;
  reauth?: boolean;
  popup?: boolean;
}): { ok: true; authUrl: string } | { ok: false; error: string } {
  const { clientId } = getGoogleOAuthClient();
  if (!clientId) {
    return { ok: false, error: "缺少 GOOGLE_OAUTH_CLIENT_ID 环境变量" };
  }

  const callbackPath = "/ads/google-ads/callback";
  const appOrigin = (readEnv("SHOPIFY_APP_URL") || params.requestOrigin).replace(/\/$/, "");
  const state = createOAuthState(
    params.shop,
    "ads_sandbox",
    params.host ?? "",
    appOrigin,
    params.popup,
  );
  const authUrl = buildAuthUrl({
    flow: "ads_sandbox",
    state,
    redirectUri: getRedirectUri(callbackPath, params.requestOrigin),
    reauth: params.reauth,
  });
  return { ok: true, authUrl };
}

/** Google Ads 测试账号 OAuth 完成后跳回广告连接与配置页。 */
export function buildGoogleAdsSandboxOAuthReturnUrl(params: {
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
    query: { ...params.query, tab: "credentials", platform: "google", sandbox: "1" },
  });
  if (adminUrl) return adminUrl;

  const base =
    params.appOrigin ||
    readEnv("GOOGLE_OAUTH_REDIRECT_BASE") ||
    readEnv("SHOPIFY_APP_URL") ||
    "https://example.com";
  const target = new URL("/app/ads-catalog", base.replace(/\/$/, "") || base);
  target.searchParams.set("shop", params.shop);
  target.searchParams.set("embedded", "1");
  target.searchParams.set("host", params.host || buildShopifyAdminHostParam(params.shop));
  for (const [key, value] of Object.entries(params.query ?? {})) {
    target.searchParams.set(key, value);
  }
  target.searchParams.set("tab", "credentials");
  target.searchParams.set("platform", "google");
  target.searchParams.set("sandbox", "1");
  return target.toString();
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<OAuthTokens> {
  const { clientId, clientSecret } = getGoogleOAuthClient();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Google token exchange failed: HTTP ${response.status} ${text.slice(0, 200)}`);
  }
  const json = JSON.parse(text) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!json.access_token) {
    throw new Error("Google token exchange returned no access_token");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in ?? 3600,
    scope: json.scope,
  };
}

/** Read the Merchant Center accounts linked to the authorized Google user. */
export async function getGmcMerchantAccounts(
  accessToken: string,
): Promise<MerchantAccount[]> {
  try {
    const accounts = await listGoogleMerchantAccounts(accessToken);
    return accounts.flatMap((account): MerchantAccount[] => {
      const merchantId =
        account.accountId?.trim() || account.name?.replace(/^accounts\//, "").trim() || "";
      if (!merchantId) return [];
      return [{ merchantId, name: account.accountName?.trim() || undefined }];
    });
  } catch (e) {
    throw new Error(formatOutboundNetworkError(e));
  }
}

/** List Google Ads client accounts that can return metrics (expands MCC children). */
export async function getAdsCustomers(
  accessToken: string,
  developerToken: string,
): Promise<AdsCustomer[]> {
  try {
    const selectable = await listSelectableAdsCustomers({ accessToken, developerToken });
    return selectable.map((c) => ({
      customerId: c.customerId,
      formatted: formatCustomerId(c.customerId),
      descriptiveName: c.descriptiveName,
      loginCustomerId: c.loginCustomerId,
    }));
  } catch (e) {
    throw new Error(formatOutboundNetworkError(e));
  }
}

export function formatCustomerId(id: string): string {
  const digits = id.replace(/\D/g, "");
  if (digits.length !== 10) return id;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** Google Search Console OAuth 完成后跳回 GSC 设置页。 */
export function buildGscOAuthReturnUrl(params: {
  shop: string;
  host?: string;
  appOrigin?: string;
  query?: Record<string, string>;
  request?: Request;
}): string {
  const adminUrl = buildAdminEmbeddedAppReturnUrl({
    path: "/app/settings/google-search-console",
    shop: params.shop,
    request: params.request,
    query: params.query,
  });
  if (adminUrl) return adminUrl;

  const base =
    params.appOrigin ||
    readEnv("GOOGLE_OAUTH_REDIRECT_BASE") ||
    readEnv("SHOPIFY_APP_URL") ||
    "https://example.com";
  const target = new URL(
    "/app/settings/google-search-console",
    base.replace(/\/$/, "") || base,
  );
  target.searchParams.set("shop", params.shop);
  target.searchParams.set("embedded", "1");
  target.searchParams.set("host", params.host || buildShopifyAdminHostParam(params.shop));
  for (const [key, value] of Object.entries(params.query ?? {})) {
    target.searchParams.set(key, value);
  }
  return target.toString();
}

/** 在嵌入式 iframe 内通过 API 鉴权后生成 Google Search Console 授权 URL。 */
export function buildGscOAuthStartUrl(params: {
  shop: string;
  host?: string;
  requestOrigin: string;
  reauth?: boolean;
  popup?: boolean;
}): { ok: true; authUrl: string } | { ok: false; error: string } {
  const { clientId } = getGoogleOAuthClient();
  if (!clientId) {
    return { ok: false, error: "缺少 GOOGLE_OAUTH_CLIENT_ID 环境变量" };
  }

  const callbackPath = "/ads/google-search-console/callback";
  const appOrigin = (readEnv("SHOPIFY_APP_URL") || params.requestOrigin).replace(/\/$/, "");
  const state = createOAuthState(
    params.shop,
    "gsc",
    params.host ?? "",
    appOrigin,
    params.popup,
  );
  const authUrl = buildAuthUrl({
    flow: "gsc",
    state,
    redirectUri: getRedirectUri(callbackPath, params.requestOrigin),
    reauth: params.reauth,
  });
  return { ok: true, authUrl };
}

/** Google Analytics 4 OAuth 完成后跳回 GA4 设置页。 */
export function buildGa4OAuthReturnUrl(params: {
  shop: string;
  host?: string;
  appOrigin?: string;
  query?: Record<string, string>;
  request?: Request;
}): string {
  const adminUrl = buildAdminEmbeddedAppReturnUrl({
    path: "/app/settings/google-analytics",
    shop: params.shop,
    request: params.request,
    query: params.query,
  });
  if (adminUrl) return adminUrl;

  const base =
    params.appOrigin ||
    readEnv("GOOGLE_OAUTH_REDIRECT_BASE") ||
    readEnv("SHOPIFY_APP_URL") ||
    "https://example.com";
  const target = new URL("/app/settings/google-analytics", base.replace(/\/$/, "") || base);
  target.searchParams.set("shop", params.shop);
  target.searchParams.set("embedded", "1");
  target.searchParams.set("host", params.host || buildShopifyAdminHostParam(params.shop));
  for (const [key, value] of Object.entries(params.query ?? {})) {
    target.searchParams.set(key, value);
  }
  return target.toString();
}

/** 在嵌入式 iframe 内通过 API 鉴权后生成 Google Analytics 4 授权 URL。 */
export function buildGa4OAuthStartUrl(params: {
  shop: string;
  host?: string;
  requestOrigin: string;
  reauth?: boolean;
  popup?: boolean;
}): { ok: true; authUrl: string } | { ok: false; error: string } {
  const { clientId } = getGoogleOAuthClient();
  if (!clientId) {
    return { ok: false, error: "缺少 GOOGLE_OAUTH_CLIENT_ID 环境变量" };
  }

  const callbackPath = "/ads/google-analytics/callback";
  const appOrigin = (readEnv("SHOPIFY_APP_URL") || params.requestOrigin).replace(/\/$/, "");
  const state = createOAuthState(params.shop, "ga4", params.host ?? "", appOrigin, params.popup);
  const authUrl = buildAuthUrl({
    flow: "ga4",
    state,
    redirectUri: getRedirectUri(callbackPath, params.requestOrigin),
    reauth: params.reauth,
  });
  return { ok: true, authUrl };
}

/**
 * OAuth 在弹窗中完成后，弹窗页通过 postMessage 把结果传回父窗口并自动关闭。
 * 父窗口（Shopify 嵌入 iframe）监听 message 事件即可接收。
 */
export function buildOAuthPopupCloseHtml(
  messageType: string,
  params: Record<string, string>,
): string {
  const safeData = JSON.stringify({ type: messageType, ...params }).replace(/<\/script>/gi, "<\\/script>");
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Authorization complete</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;align-items:center;
         justify-content:center;min-height:100vh;margin:0;background:#f9fafb;color:#374151}
    .card{text-align:center;padding:2rem;max-width:320px}
    .icon{font-size:2.5rem;margin-bottom:0.75rem}
    p{margin:0;font-size:0.9rem;color:#6b7280}
  </style>
</head>
<body>
<div class="card">
  <div class="icon">✓</div>
  <p>Authorization complete. This window will close automatically.</p>
</div>
<script>
(function(){
  var data = ${safeData};
  if (window.opener) {
    try { window.opener.postMessage(data, '*'); } catch(e) {}
  }
  setTimeout(function(){ window.close(); }, 600);
})();
</script>
</body>
</html>`;
}

export function buildGa4OAuthPopupCloseHtml(params: Record<string, string>): string {
  return buildOAuthPopupCloseHtml("ga4_oauth", params);
}

export function buildGscOAuthPopupCloseHtml(params: Record<string, string>): string {
  return buildOAuthPopupCloseHtml("gsc_oauth", params);
}
