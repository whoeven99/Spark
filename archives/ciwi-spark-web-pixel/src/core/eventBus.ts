/**
 * 包装 Shopify `analytics.subscribe(name, handler)`，统一签名 +
 * 在 handler 外层 try/catch，避免单个 module 抛错把整个 pixel sandbox 弄挂。
 */

export type AnalyticsLike = {
  subscribe: (name: string, handler: (event: unknown) => void | Promise<void>) => void;
};

export type EventBus = {
  on: (
    name: string,
    handler: (event: unknown) => void | Promise<void>,
  ) => void;
};

export function createEventBus(analytics: AnalyticsLike, debug: boolean): EventBus {
  return {
    on(name, handler) {
      analytics.subscribe(name, async (event) => {
        try {
          await handler(event);
        } catch (err) {
          if (debug) {
            // eslint-disable-next-line no-console
            console.warn(`[ciwi-spark-web-pixel] handler "${name}" threw`, err);
          }
        }
      });
    },
  };
}
