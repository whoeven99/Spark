import type { PixelModule } from "../core/moduleRegistry";
import { buildEnvelope } from "../core/schema";

/**
 * 订阅 Shopify Web Pixels 的**全部标准事件**（`all_standard_events`），
 * 标准化为 `spark:shopify:<name>` 上报到 SLS。
 *
 * 设计要点：
 * - 用 all_standard_events 而非逐个订阅：Shopify 后续新增标准事件
 *   （如 alert_displayed、ui_extension_errored 这类后加的）会被自动捕获；
 * - payload 携带完整 `event.data` + `event.context` 快照（业务侧明确要求
 *   整包上报）；超出体积上限时按「丢 context → 丢 data」两级降级，
 *   保证事件发生记录本身不丢；
 * - productId 对商品类事件做 best-effort 提取，便于 SLS 按商品维度检索。
 *
 * 当前标准事件清单（api_version 2026-07，共 15 个）：
 * alert_displayed / cart_viewed / checkout_address_info_submitted /
 * checkout_completed / checkout_contact_info_submitted /
 * checkout_shipping_info_submitted / checkout_started / collection_viewed /
 * page_viewed / payment_info_submitted / product_added_to_cart /
 * product_removed_from_cart / product_viewed / search_submitted /
 * ui_extension_errored
 */

/** 与后端 EVENT_REGEX 对齐：事件名仅允许小写字母数字与 `_.-`。 */
const EVENT_NAME_REGEX = /^[a-z0-9][a-z0-9_.-]*$/;

/** 留余量对齐后端 PIXEL_INGEST_LIMITS.payloadBytes（224KB），客户端按 200KB 截断。 */
const MAX_PAYLOAD_BYTES = 200 * 1024;

type StandardEvent = {
  id?: string;
  name?: string;
  timestamp?: string;
  seq?: number;
  context?: Record<string, unknown>;
  data?: Record<string, unknown>;
};

function pick(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** 商品类事件的 productId 提取路径（product_viewed / cart 行级事件）。 */
const PRODUCT_ID_PATHS: string[][] = [
  ["productVariant", "product", "id"],
  ["cartLine", "merchandise", "product", "id"],
];

function extractProductId(data: unknown): string | undefined {
  for (const path of PRODUCT_ID_PATHS) {
    const v = pick(data, path);
    if (typeof v === "string" && v) return v;
  }
  return undefined;
}

function byteLength(s: string): number {
  try {
    return new TextEncoder().encode(s).length;
  } catch {
    // 兜底按最坏 UTF-16 → UTF-8 膨胀估算。
    return s.length * 2;
  }
}

function fits(payload: Record<string, unknown>): boolean {
  try {
    return byteLength(JSON.stringify(payload)) <= MAX_PAYLOAD_BYTES;
  } catch {
    return false;
  }
}

/** context 的最小可用摘要：降级时保住页面定位信息。 */
function contextSummary(context: unknown): Record<string, unknown> {
  const doc = pick(context, ["document"]);
  return {
    url: pick(doc, ["location", "href"]),
    referrer: pick(doc, ["referrer"]),
    title: pick(doc, ["title"]),
  };
}

function buildPayload(evt: StandardEvent): Record<string, unknown> {
  const head = {
    eventId: evt.id,
    eventTimestamp: evt.timestamp,
    seq: evt.seq,
  };

  const full = { ...head, context: evt.context, data: evt.data };
  if (fits(full)) return full;

  // 降级 1：context 换成摘要（checkout 全量 data 优先保留）。
  const slim = { ...head, context: contextSummary(evt.context), data: evt.data };
  if (fits(slim)) return slim;

  // 降级 2：连 data 也放不下，仅保留事件发生记录 + 截断标志。
  return { ...head, context: contextSummary(evt.context), truncated: true };
}

export const shopifyAnalyticsModule: PixelModule = {
  name: "shopifyAnalytics",

  init({ bus, sink, base, log }) {
    bus.on("all_standard_events", (raw) => {
      const evt = (raw ?? {}) as StandardEvent;
      const name = typeof evt.name === "string" ? evt.name.trim().toLowerCase() : "";
      if (!name || !EVENT_NAME_REGEX.test(name)) return;

      void sink.send({
        ts: Date.now(),
        event: `spark:shopify:${name}`,
        schemaVersion: 1,
        shopName: base.shopName,
        clientId: base.clientId,
        source: base.source,
        productId: extractProductId(evt.data),
        payload: buildPayload(evt),
      });
    });

    log("shopifyAnalytics: subscribed all_standard_events");
  },
};
