import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { pushSlsLog } from "../server/aliyunLog/pushLog.server";
import {
  PIXEL_INGEST_LIMITS,
  createRateLimiter,
  validatePixelEnvelope,
} from "../server/aliyunLog/pixelIngest.server";

/**
 * 公开 ingest 路由：接收 Web Pixel / Storefront 上报的事件并写入阿里云 SLS。
 *
 * 设计要点：
 * - 不依赖 Shopify admin session（pixel sandbox 没有），靠纵深防御替代鉴权；
 * - 写入失败也返回 200，避免泄露后端状态 + 防止 pixel sandbox 触发重试风暴；
 * - 跨源请求来自 storefront 与 web pixel sandbox（隔离的同源），需放行 CORS。
 */

const ALLOWED_ORIGIN_REGEX = /^https:\/\/([a-z0-9-]+\.)*(myshopify\.com|shopifycdn\.com|shopifypreview\.com)$/i;

const limiter = createRateLimiter();

function corsHeaders(origin: string | null): Record<string, string> {
  // Web Pixel sandbox 与 storefront 来源不同，按白名单回写 Allow-Origin。
  const allowed = origin && ALLOWED_ORIGIN_REGEX.test(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowed,
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

  // Web Pixel sandbox 用 "simple request" 避免 preflight，会带 text/plain；
  // storefront / 后端联调用 application/json。两者都接受。
  const ctype = (request.headers.get("content-type") || "").toLowerCase();
  if (
    ctype &&
    !ctype.startsWith("application/json") &&
    !ctype.startsWith("text/plain")
  ) {
    return jsonResponse({ error: "Unsupported Content-Type" }, { status: 415, headers });
  }

  let bodyText: string;
  try {
    bodyText = await request.text();
  } catch {
    return jsonResponse({ error: "Cannot read body" }, { status: 400, headers });
  }
  if (Buffer.byteLength(bodyText, "utf8") > PIXEL_INGEST_LIMITS.bodyBytes) {
    return jsonResponse({ error: "Body too large" }, { status: 413, headers });
  }

  let parsed: unknown;
  try {
    parsed = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, { status: 400, headers });
  }

  const result = validatePixelEnvelope(parsed);
  if (!result.ok) {
    return jsonResponse({ error: result.error }, { status: result.status, headers });
  }
  const env = result.envelope;

  if (!limiter.take(env.shopName, env.clientId)) {
    return jsonResponse({ error: "Rate limited" }, { status: 429, headers });
  }

  // 写入 SLS：失败不阻塞响应，由 pushSlsLog 内部记 warn。
  await pushSlsLog({
    topic: env.event,
    source: env.shopName,
    timestamp: env.ts,
    content: {
      event: env.event,
      schemaVersion: String(env.schemaVersion),
      shopName: env.shopName,
      clientId: env.clientId,
      source: env.source,
      productId: env.productId ?? "",
      payload: env.payload ? JSON.stringify(env.payload) : "",
    },
  });

  return jsonResponse({ ok: true }, { status: 200, headers });
};
