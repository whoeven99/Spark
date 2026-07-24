/**
 * 前端埋点 / 业务事件上报到阿里云 SLS 的通用 envelope 协议。
 *
 * 与 `extensions/ciwi-spark-web-pixel/src/core/schema.ts` 字段保持同步，
 * 但两侧独立声明（不跨 workspace 引用类型），以保留 sandbox 隔离。
 */

/** Envelope schema 版本号。字段不兼容变更时 +1 并在 ingest 路由内做迁移兼容。 */
export const PIXEL_SCHEMA_VERSION = 1;

/** 允许写入 SLS 的 topic 前缀。任何前端上报必须以这些前缀开头。 */
export const ALLOWED_TOPIC_PREFIXES = ["spark:", "shopify:"] as const;

export type PixelEventPayload = Record<string, unknown>;

export type PixelEventEnvelope = {
  /** 上报时刻（毫秒）。后端会归一化为秒级写入 SLS。 */
  ts: number;
  /** 事件名（也是 SLS topic），需以 `spark:` 或 `shopify:` 起头。 */
  event: string;
  /** 协议版本。 */
  schemaVersion: number;
  /** Shopify 店铺域名（`*.myshopify.com`），同时作为 SLS source。 */
  shopName: string;
  /** 客户端访问者 ID（来自 `_shopify_y` cookie 或 sessionStorage 兜底 UUID）。 */
  clientId: string;
  /** 上报来源（如 `web-pixel:ciwi-spark-web-pixel`、`storefront:theme-block` 等）。 */
  source: string;
  /** 可选：相关商品 ID，便于按商品维度查询。 */
  productId?: string;
  /** 业务自定义 payload，会被 JSON.stringify 后写入 SLS content。 */
  payload?: PixelEventPayload;
};
