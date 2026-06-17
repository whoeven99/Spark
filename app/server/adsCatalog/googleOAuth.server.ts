import crypto from "node:crypto";
import { formatOutboundNetworkError } from "../common/outboundError.server";
import { buildShopifyAdminHostParam } from "../billing/buildBillingReturnUrl.server";

export const GOOGLE_OAUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const GMC_SCOPE = "https://www.googleapis.com/auth/content";
export const ADS_SCOPE = "https://www.googleapis.com/auth/adwords";

export type OAuthFlow = "gmc" | "ads";

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
export function getRedirectUri(path: string): string {
  const base =
    readEnv("GOOGLE_OAUTH_REDIRECT_BASE") || readEnv("SHOPIFY_APP_URL");
  return `${base.replace(/\/$/, "")}${path}`;
}

/** Google OAuth 完成后跳回嵌入式应用（需 shop + host + embedded，否则落到 /auth/login）。 */
export function buildGoogleOAuthReturnUrl(params: {
  shop: string;
  host?: string;
  query?: Record<string, string>;
}): string {
  const base =
    readEnv("GOOGLE_OAUTH_REDIRECT_BASE") || readEnv("SHOPIFY_APP_URL") || "https://example.com";
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

export function createOAuthState(shop: string, flow: OAuthFlow, host = ""): string {
  const payload = JSON.stringify({
    shop,
    flow,
    host,
    nonce: crypto.randomBytes(8).toString("hex"),
    ts: Date.now(),
  });
  const encoded = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", stateSecret()).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyOAuthState(
  state: string,
  maxAgeMs = 15 * 60 * 1000,
): { shop: string; flow: OAuthFlow; host: string } | null {
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
      ts?: number;
    };
    if (!payload.shop || (payload.flow !== "gmc" && payload.flow !== "ads")) return null;
    if (typeof payload.ts !== "number" || Date.now() - payload.ts > maxAgeMs) return null;
    return { shop: payload.shop, flow: payload.flow, host: payload.host ?? "" };
  } catch {
    return null;
  }
}

/** Build the Google consent screen URL for the given flow. */
export function buildAuthUrl(params: {
  flow: OAuthFlow;
  state: string;
  redirectUri: string;
}): string {
  const { clientId } = getGoogleOAuthClient();
  const scope = params.flow === "gmc" ? GMC_SCOPE : ADS_SCOPE;
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state: params.state,
  });
  return `${GOOGLE_OAUTH_BASE}?${query.toString()}`;
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
    const response = await fetch(
      "https://shoppingcontent.googleapis.com/content/v2.1/accounts/authinfo",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const json = (await response.json().catch(() => ({}))) as {
      accountIdentifiers?: Array<{ merchantId?: string; aggregatorId?: string }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(json.error?.message || `HTTP ${response.status}`);
    }
    const ids = json.accountIdentifiers ?? [];
    return ids
      .map((i) => i.merchantId || i.aggregatorId)
      .filter((id): id is string => Boolean(id))
      .map((merchantId) => ({ merchantId }));
  } catch (e) {
    throw new Error(formatOutboundNetworkError(e));
  }
}

/** List the Google Ads customer accounts accessible to the authorized user. */
export async function getAdsCustomers(
  accessToken: string,
  developerToken: string,
): Promise<AdsCustomer[]> {
  try {
    const response = await fetch(
      "https://googleads.googleapis.com/v17/customers:listAccessibleCustomers",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": developerToken,
        },
      },
    );
    const json = (await response.json().catch(() => ({}))) as {
      resourceNames?: string[];
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(json.error?.message || `HTTP ${response.status}`);
    }
    const names = json.resourceNames ?? [];
    return names.map((name) => {
      const id = name.replace(/^customers\//, "");
      return { customerId: id, formatted: formatCustomerId(id) };
    });
  } catch (e) {
    throw new Error(formatOutboundNetworkError(e));
  }
}

export function formatCustomerId(id: string): string {
  const digits = id.replace(/\D/g, "");
  if (digits.length !== 10) return id;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * Query the GMC ↔ Ads link status for a Google Ads customer.
 * Returns whether the given merchantId is linked to the customer account.
 */
export async function getMerchantCenterLinkStatus(params: {
  accessToken: string;
  developerToken: string;
  customerId: string;
  merchantId?: string;
}): Promise<{ linked: boolean; links: Array<{ merchantId: string; status: string }> }> {
  const customerDigits = params.customerId.replace(/\D/g, "");
  const response = await fetch(
    `https://googleads.googleapis.com/v17/customers/${customerDigits}/merchantCenterLinks`,
    {
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "developer-token": params.developerToken,
      },
    },
  );
  const json = (await response.json().catch(() => ({}))) as {
    merchantCenterLinks?: Array<{ id?: string; merchantCenterId?: string; status?: string }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(json.error?.message || `HTTP ${response.status}`);
  }
  const links = (json.merchantCenterLinks ?? []).map((l) => ({
    merchantId: String(l.merchantCenterId ?? l.id ?? ""),
    status: l.status ?? "UNKNOWN",
  }));
  const linked = params.merchantId
    ? links.some(
        (l) => l.merchantId === params.merchantId && l.status === "ENABLED",
      )
    : links.some((l) => l.status === "ENABLED");
  return { linked, links };
}
