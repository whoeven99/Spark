import type { ShopifyAdminGraphqlClient } from "../server/ai/skills/shopifyInfo/shopifyInfo.tool";
import {
  fetchShopLocalesPayload,
  fetchShopLocalesPayloadCached,
} from "../server/productImprove/shopLocalesFetcher.server";
import { DEFAULT_LOCALE, type SupportedLocale } from "./config";
import { detectRequestLocale, readManualLocaleCookie } from "./detector.server";

/**
 * 解析当前请求的 UI/AI 语言。
 * 有手动 Cookie 时不打店铺语言接口；否则用 shopLocales 主语言映射。
 *
 * 传入 `shop` 时店铺主语言走进程内 TTL 缓存（本函数在 `/app` 壳层首屏、chat-stream、
 * ai-task 等多条链路上，每次都回源会平白加一次 GraphQL 往返）。缓存只覆盖店铺级的
 * 主语言，最终 UI 语言仍按当前 request 逐次解析，不会在不同访客之间串味。
 */
export async function resolveUiLocale(
  request: Request,
  options?: {
    admin?: ShopifyAdminGraphqlClient | null;
    shop?: string | null;
    logContext?: string;
  },
): Promise<SupportedLocale> {
  const manual = readManualLocaleCookie(request);
  if (manual) {
    return manual;
  }

  const admin = options?.admin;
  if (!admin) {
    return detectRequestLocale(request);
  }

  try {
    const logContext = options?.logContext ?? "ui-locale";
    const shop = options?.shop?.trim();
    const payload = shop
      ? await fetchShopLocalesPayloadCached(admin, shop, logContext)
      : await fetchShopLocalesPayload(admin, logContext);
    return detectRequestLocale(request, {
      shopPrimaryLocale: payload.defaultTargetLanguage,
    });
  } catch (error) {
    console.warn("[i18n] resolveUiLocale shop locales failed:", error);
    return DEFAULT_LOCALE;
  }
}
