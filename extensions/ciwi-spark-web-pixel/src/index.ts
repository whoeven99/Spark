import { register } from "@shopify/web-pixels-extension";
import { readPixelSettings } from "./core/config";
import { createEventBus } from "./core/eventBus";
import { registerModule, type ModuleContext } from "./core/moduleRegistry";
import type { BaseContext } from "./core/schema";
import { createSink } from "./core/sink";
import { customEventsModule } from "./modules/customEvents";
import { shopifyAnalyticsModule } from "./modules/shopifyAnalytics";

const SOURCE = "web-pixel:ciwi-spark-web-pixel";
const CLIENT_ID_STORAGE_KEY = "ciwi-spark-pixel-cid";

function randomId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    // ignore
  }
  // 退化方案：32 位十六进制串。
  let out = "";
  for (let i = 0; i < 32; i++) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}

async function resolveClientId(
  browser: {
    cookie: { get: (k: string) => Promise<string | null> };
    sessionStorage: {
      getItem: (k: string) => Promise<string | null>;
      setItem: (k: string, v: string) => Promise<void>;
    };
  },
  fallbackClientId: string | undefined,
): Promise<string> {
  // 1) Shopify 官方访客 cookie，最稳。
  try {
    const y = await browser.cookie.get("_shopify_y");
    if (y && y.trim()) return y.trim();
  } catch {
    // ignore
  }
  // 2) Web Pixel 自带的 clientId（仅当前事件）也可作 fallback 锚点。
  if (fallbackClientId && fallbackClientId.trim()) return fallbackClientId.trim();
  // 3) sessionStorage 缓存的随机 ID（同会话稳定）。
  try {
    const cached = await browser.sessionStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (cached && cached.trim()) return cached.trim();
    const fresh = randomId();
    await browser.sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return randomId();
  }
}

register(async (api) => {
  const { analytics, browser, settings } = api as unknown as {
    analytics: { subscribe: (n: string, h: (e: unknown) => void | Promise<void>) => void };
    browser: {
      cookie: { get: (k: string) => Promise<string | null> };
      sessionStorage: {
        getItem: (k: string) => Promise<string | null>;
        setItem: (k: string, v: string) => Promise<void>;
      };
    };
    settings: Record<string, unknown>;
  };

  const cfg = readPixelSettings(settings);
  if (!cfg) {
    // eslint-disable-next-line no-console
    console.warn(
      "[ciwi-spark-web-pixel] missing required settings (shopName / ingestEndpoint), skipped",
    );
    return;
  }

  if (cfg.sampling <= 0) {
    if (cfg.debug) {
      // eslint-disable-next-line no-console
      console.log("[ciwi-spark-web-pixel] sampling=0, skipped");
    }
    return;
  }

  const clientId = await resolveClientId(browser, undefined);

  const base: BaseContext = {
    shopName: cfg.shopName,
    clientId,
    source: SOURCE,
  };

  const sink = createSink({
    endpoint: cfg.ingestEndpoint,
    sampling: cfg.sampling,
    debug: cfg.debug,
  });

  const bus = createEventBus(analytics, cfg.debug);

  const ctx: ModuleContext = {
    settings: cfg,
    base,
    sink,
    bus,
    log: cfg.debug
      // eslint-disable-next-line no-console
      ? (...args) => console.log("[ciwi-spark-web-pixel]", ...args)
      : () => {},
  };

  registerModule(ctx, shopifyAnalyticsModule);
  registerModule(ctx, customEventsModule);

  ctx.log("ready", { shopName: cfg.shopName, sampling: cfg.sampling });
});
