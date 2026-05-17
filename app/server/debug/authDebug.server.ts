import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

const DEBUG_ENDPOINT =
  "http://127.0.0.1:7753/ingest/818798f0-158f-41e7-bccb-86c20f299999";
const DEBUG_SESSION = "2c7630";
const DEBUG_LOG_FILE = resolve(process.cwd(), "debug-2c7630.log");

type DebugPayload = {
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
  runId?: string;
};

export function debugAuthLog(payload: DebugPayload): void {
  const entry = {
    sessionId: DEBUG_SESSION,
    timestamp: Date.now(),
    runId: payload.runId ?? "pre-fix",
    hypothesisId: payload.hypothesisId,
    location: payload.location,
    message: payload.message,
    data: payload.data ?? {},
  };

  const line = `${JSON.stringify(entry)}\n`;

  // #region agent log
  console.info(`[DEBUG-2c7630] ${line.trim()}`);
  fetch(DEBUG_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": DEBUG_SESSION,
    },
    body: JSON.stringify(entry),
  }).catch(() => {});
  try {
    appendFileSync(DEBUG_LOG_FILE, line, "utf8");
  } catch {
    // ignore when filesystem is unavailable (e.g. some hosts)
  }
  // #endregion
}

export function extractAuthRequestContext(request: Request) {
  const url = new URL(request.url);
  return {
    pathname: url.pathname,
    search: url.search,
    shop: url.searchParams.get("shop"),
    host: url.searchParams.get("host"),
    embedded: url.searchParams.get("embedded"),
    hasIdToken: url.searchParams.has("id_token"),
    hasSession: url.searchParams.has("session"),
    hasCode: url.searchParams.has("code"),
    hasHmac: url.searchParams.has("hmac"),
    referer: request.headers.get("referer"),
    secFetchDest: request.headers.get("sec-fetch-dest"),
    userAgent: request.headers.get("user-agent")?.slice(0, 120) ?? null,
  };
}

export function extractRedirectInfo(error: unknown) {
  if (!(error instanceof Response)) {
    return {
      isRedirect: false,
      status: null,
      location: null,
      isAccountsShopify: false,
      isAuthCallback: false,
      hasExitIframeHeader: false,
    };
  }

  const location = error.headers.get("location");
  return {
    isRedirect: true,
    status: error.status,
    location,
    isAccountsShopify: Boolean(location?.includes("accounts.shopify.com")),
    isAuthCallback: Boolean(location?.includes("/auth/")),
    hasExitIframeHeader: Boolean(
      error.headers.get("x-shopify-api-request-failure-reauthorize-url") ||
        error.headers.get("x-shopify-api-request-failure-reauthorize") ||
        location?.includes("exitiframe") ||
        location?.includes("/auth"),
    ),
  };
}

export function extractEnvSnapshot() {
  const apiKey = process.env.SHOPIFY_API_KEY?.trim() ?? "";
  return {
    appEntry: process.env.APP_ENTRY ?? "(unset)",
    shopifyAppUrl: process.env.SHOPIFY_APP_URL ?? "(unset)",
    scopes: process.env.SCOPES ?? "(unset)",
    apiKeySuffix: apiKey ? apiKey.slice(-6) : "(unset)",
    nodeEnv: process.env.NODE_ENV ?? "(unset)",
    tursoTarget: process.env.TURSO_TARGET ?? "(unset)",
  };
}
