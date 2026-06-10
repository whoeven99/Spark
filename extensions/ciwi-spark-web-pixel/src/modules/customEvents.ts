import type { PixelModule } from "../core/moduleRegistry";

/**
 * 订阅 Shopify Custom Pixel Events 通道。这是「前端组件主动 dispatch」
 * 的入口：未来 Theme Block / app proxy / storefront JS 调用
 *
 *   window.Shopify.analytics.publish('ciwi:image_replaced', { ... })
 *
 * 这个 module 会捕获到、检查 `ciwi:` 前缀、改写 event 名为
 * `spark:custom:<原 name 去掉 ciwi: 前缀>` 后上报。
 *
 * 这样：
 * - 新业务接入 = 在前端组件 publish 即可，无需改 pixel；
 * - SLS 后台按 topic 前缀 `spark:custom:` 一眼就能筛出业务自定义事件。
 */

const CIWI_PREFIX = "ciwi:";

type CustomEventLike = {
  name?: string;
  customData?: unknown;
  data?: { customData?: unknown };
  clientId?: string;
  timestamp?: string;
};

function extractCustomData(evt: CustomEventLike): Record<string, unknown> | undefined {
  const candidate = evt.customData ?? evt.data?.customData;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return undefined;
  }
  return candidate as Record<string, unknown>;
}

export const customEventsModule: PixelModule = {
  name: "customEvents",

  init({ bus, sink, base, log }) {
    bus.on("all_custom_events", (raw) => {
      const evt = (raw ?? {}) as CustomEventLike;
      const name = typeof evt.name === "string" ? evt.name.trim() : "";
      if (!name.toLowerCase().startsWith(CIWI_PREFIX)) {
        // 非 ciwi:* 命名空间的自定义事件直接忽略，避免被噪声淹没。
        return;
      }

      const slug = name.slice(CIWI_PREFIX.length).toLowerCase();
      if (!slug) return;

      const payload = extractCustomData(evt);
      const productId =
        payload && typeof payload.productId === "string" ? payload.productId : undefined;

      void sink.send({
        ts: Date.now(),
        event: `spark:custom:${slug}`,
        schemaVersion: 1,
        shopName: base.shopName,
        clientId: base.clientId,
        source: base.source,
        productId,
        payload,
      });
    });

    log("customEvents: subscribed all_custom_events (filter ciwi:*)");
  },
};
