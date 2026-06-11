import {
  ALLOWED_TOPIC_PREFIXES,
  PIXEL_SCHEMA_VERSION,
  type PixelEventEnvelope,
} from "./types";

/** ingest 路由的所有上限常量（修改时同步更新单测）。 */
export const PIXEL_INGEST_LIMITS = {
  /**
   * 请求体最大字节数（解析前）。
   * 标准事件整包上报（含完整 event.data + context）后放宽到 256KB；
   * pixel 侧以 200KB 为目标做了两级降级截断，正常不会逼近此上限。
   */
  bodyBytes: 256 * 1024,
  /** payload JSON 序列化后的最大字节数。 */
  payloadBytes: 224 * 1024,
  event: 128,
  shopName: 253,
  clientId: 64,
  productId: 128,
  source: 128,
  /** 单 (shop, clientId) 滑窗速率限制：每 windowMs 最多 maxRequests 次。 */
  rateLimit: {
    windowMs: 60_000,
    maxRequests: 60,
  },
} as const;

/** 合法的 Shopify 店铺域名：`*.myshopify.com`，小写、`-`/`a-z0-9` 子域。 */
const SHOP_NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,61}\.myshopify\.com$/;

/** event 仅允许 `[a-z0-9:_.-]`，避免注入到 SLS topic 索引。 */
const EVENT_REGEX = /^[a-z0-9][a-z0-9:_.-]*$/;

/** clientId 允许字母/数字/`-_.`（覆盖 UUID、`_shopify_y`、自定义 ID）。 */
const CLIENT_ID_REGEX = /^[A-Za-z0-9._-]+$/;

export type EnvelopeValidationOk = {
  ok: true;
  envelope: PixelEventEnvelope;
};

export type EnvelopeValidationErr = {
  ok: false;
  status: 400 | 413 | 415;
  error: string;
};

/**
 * 校验前端上报体并返回归一化后的 envelope。**纯函数**，方便单测。
 *
 * 校验项：必填字段、长度上限、正则白名单、topic 前缀白名单、payload 序列化体积。
 */
export function validatePixelEnvelope(
  raw: unknown,
): EnvelopeValidationOk | EnvelopeValidationErr {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, status: 400, error: "body must be a JSON object" };
  }
  const r = raw as Record<string, unknown>;

  const event = typeof r.event === "string" ? r.event.trim() : "";
  if (!event) return { ok: false, status: 400, error: "missing event" };
  if (event.length > PIXEL_INGEST_LIMITS.event) {
    return { ok: false, status: 400, error: "event too long" };
  }
  if (!EVENT_REGEX.test(event)) {
    return { ok: false, status: 400, error: "event contains invalid chars" };
  }
  if (!ALLOWED_TOPIC_PREFIXES.some((p) => event.startsWith(p))) {
    return {
      ok: false,
      status: 400,
      error: `event must start with one of: ${ALLOWED_TOPIC_PREFIXES.join(", ")}`,
    };
  }

  const shopName = typeof r.shopName === "string" ? r.shopName.trim().toLowerCase() : "";
  if (!shopName) return { ok: false, status: 400, error: "missing shopName" };
  if (shopName.length > PIXEL_INGEST_LIMITS.shopName) {
    return { ok: false, status: 400, error: "shopName too long" };
  }
  if (!SHOP_NAME_REGEX.test(shopName)) {
    return { ok: false, status: 400, error: "shopName must be a *.myshopify.com domain" };
  }

  const clientId = typeof r.clientId === "string" ? r.clientId.trim() : "";
  if (!clientId) return { ok: false, status: 400, error: "missing clientId" };
  if (clientId.length > PIXEL_INGEST_LIMITS.clientId) {
    return { ok: false, status: 400, error: "clientId too long" };
  }
  if (!CLIENT_ID_REGEX.test(clientId)) {
    return { ok: false, status: 400, error: "clientId contains invalid chars" };
  }

  const source = typeof r.source === "string" ? r.source.trim() : "";
  if (!source) return { ok: false, status: 400, error: "missing source" };
  if (source.length > PIXEL_INGEST_LIMITS.source) {
    return { ok: false, status: 400, error: "source too long" };
  }

  const productId =
    typeof r.productId === "string" && r.productId.trim().length > 0
      ? r.productId.trim()
      : undefined;
  if (productId && productId.length > PIXEL_INGEST_LIMITS.productId) {
    return { ok: false, status: 400, error: "productId too long" };
  }

  let payload: Record<string, unknown> | undefined;
  if (r.payload !== undefined && r.payload !== null) {
    if (typeof r.payload !== "object" || Array.isArray(r.payload)) {
      return { ok: false, status: 400, error: "payload must be a JSON object" };
    }
    payload = r.payload as Record<string, unknown>;
    let serialized = "";
    try {
      serialized = JSON.stringify(payload);
    } catch {
      return { ok: false, status: 400, error: "payload is not serializable" };
    }
    if (Buffer.byteLength(serialized, "utf8") > PIXEL_INGEST_LIMITS.payloadBytes) {
      return { ok: false, status: 413, error: "payload too large" };
    }
  }

  const tsRaw = r.ts;
  let ts = typeof tsRaw === "number" && Number.isFinite(tsRaw) ? tsRaw : Date.now();
  // 容忍少量时钟漂移；过远的时间戳改用服务端时间。
  const now = Date.now();
  if (ts < now - 7 * 24 * 3600_000 || ts > now + 5 * 60_000) {
    ts = now;
  }

  const schemaVersion =
    typeof r.schemaVersion === "number" && Number.isFinite(r.schemaVersion)
      ? r.schemaVersion
      : PIXEL_SCHEMA_VERSION;

  return {
    ok: true,
    envelope: {
      ts,
      event,
      schemaVersion,
      shopName,
      clientId,
      source,
      productId,
      payload,
    },
  };
}

/**
 * 进程内令牌桶：单 (shop, clientId) 维度，windowMs 内最多 maxRequests 次。
 * 多副本部署时各副本独立计数 —— 起步够用，后续可平滑切到 Redis。
 *
 * 暴露为可注入的工厂便于单测注入虚拟时间。
 */
export function createRateLimiter(opts?: {
  windowMs?: number;
  maxRequests?: number;
  now?: () => number;
}) {
  const windowMs = opts?.windowMs ?? PIXEL_INGEST_LIMITS.rateLimit.windowMs;
  const maxRequests = opts?.maxRequests ?? PIXEL_INGEST_LIMITS.rateLimit.maxRequests;
  const now = opts?.now ?? (() => Date.now());

  const buckets = new Map<string, { count: number; resetAt: number }>();

  function gc(currentTs: number) {
    if (buckets.size < 1024) return;
    for (const [k, b] of buckets) {
      if (b.resetAt <= currentTs) buckets.delete(k);
    }
  }

  return {
    /** @returns true 表示允许；false 表示已超限。 */
    take(shopName: string, clientId: string): boolean {
      const currentTs = now();
      const key = `${shopName}|${clientId}`;
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= currentTs) {
        buckets.set(key, { count: 1, resetAt: currentTs + windowMs });
        gc(currentTs);
        return true;
      }
      if (bucket.count >= maxRequests) return false;
      bucket.count += 1;
      return true;
    },
    /** 测试钩子。 */
    _size: () => buckets.size,
  };
}
