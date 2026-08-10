import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { trackMetaStorefrontTestEvent } from "../server/adsCatalog/metaPixelConfig.server";

/**
 * 店面公开端点：仅在 Ads Catalog 开启 Test Event Code 时，
 * 把浏览/加购等事件经 CAPI 打进 Meta Test Events（服务器侧）。
 */

const ALLOWED_ORIGIN_REGEX =
  /^https:\/\/([a-z0-9-]+\.)*(myshopify\.com|shopifycdn\.com|shopifypreview\.com)$/i;

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_SHOP = 60;
const rateBuckets = new Map<string, { resetAt: number; count: number }>();

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    origin && (ALLOWED_ORIGIN_REGEX.test(origin) || origin.startsWith("https://"))
      ? origin
      : "";
  return {
    "Access-Control-Allow-Origin": allowed || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
}

function jsonResponse(
  body: unknown,
  init: { status: number; headers: Record<string, string> },
) {
  return new Response(JSON.stringify(body), {
    status: init.status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...init.headers,
    },
  });
}

function takeRate(shop: string): boolean {
  const now = Date.now();
  const key = shop.toLowerCase();
  const cur = rateBuckets.get(key);
  if (!cur || cur.resetAt <= now) {
    rateBuckets.set(key, { resetAt: now + RATE_WINDOW_MS, count: 1 });
    return true;
  }
  if (cur.count >= RATE_MAX_PER_SHOP) return false;
  cur.count += 1;
  return true;
}

function normalizeShop(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!s) return "";
  return s.includes(".") ? s : `${s}.myshopify.com`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const headers = corsHeaders(request.headers.get("origin"));
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  return jsonResponse({ error: "Method not allowed" }, { status: 405, headers });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const headers = corsHeaders(request.headers.get("origin"));

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405, headers });
  }

  const ctype = (request.headers.get("content-type") || "").toLowerCase();
  if (
    ctype &&
    !ctype.startsWith("application/json") &&
    !ctype.startsWith("text/plain")
  ) {
    return jsonResponse({ error: "Unsupported Content-Type" }, { status: 415, headers });
  }

  let bodyText = "";
  try {
    bodyText = await request.text();
  } catch {
    return jsonResponse({ error: "Cannot read body" }, { status: 400, headers });
  }
  if (bodyText.length > 16_384) {
    return jsonResponse({ error: "Body too large" }, { status: 413, headers });
  }

  let parsed: {
    shop?: unknown;
    event?: unknown;
    eventId?: unknown;
    properties?: unknown;
    pageUrl?: unknown;
  } = {};
  try {
    parsed = bodyText ? (JSON.parse(bodyText) as typeof parsed) : {};
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, { status: 400, headers });
  }

  const shop = normalizeShop(parsed.shop);
  const event = typeof parsed.event === "string" ? parsed.event.trim() : "";
  if (!shop || !event) {
    return jsonResponse({ error: "shop and event required" }, { status: 400, headers });
  }
  if (!takeRate(shop)) {
    return jsonResponse({ error: "rate_limited" }, { status: 429, headers });
  }

  const properties =
    parsed.properties &&
    typeof parsed.properties === "object" &&
    !Array.isArray(parsed.properties)
      ? (parsed.properties as Record<string, unknown>)
      : undefined;

  const result = await trackMetaStorefrontTestEvent({
    shop,
    event,
    eventId: typeof parsed.eventId === "string" ? parsed.eventId : undefined,
    properties,
    pageUrl: typeof parsed.pageUrl === "string" ? parsed.pageUrl : undefined,
  });

  return jsonResponse(
    { ok: result.sent, skipped: !result.sent, reason: result.reason },
    { status: 200, headers },
  );
};
