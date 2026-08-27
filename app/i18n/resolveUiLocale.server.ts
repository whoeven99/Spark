import type { ShopifyAdminGraphqlClient } from "../server/ai/skills/shopifyInfo/shopifyInfo.tool";
import { fetchShopLocalesPayload } from "../server/productImprove/shopLocalesFetcher.server";
import { DEFAULT_LOCALE, type SupportedLocale } from "./config";
import { detectRequestLocale, readManualLocaleCookie } from "./detector.server";

/**
 * 解析当前请求的 UI/AI 语言。
 * 有手动 Cookie 时不打店铺语言接口；否则用 shopLocales 主语言映射。
 */
export async function resolveUiLocale(
  request: Request,
  options?: {
    admin?: ShopifyAdminGraphqlClient | null;
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
    const payload = await fetchShopLocalesPayload(
      admin,
      options?.logContext ?? "ui-locale",
    );
    return detectRequestLocale(request, {
      shopPrimaryLocale: payload.defaultTargetLanguage,
    });
  } catch (error) {
    console.warn("[i18n] resolveUiLocale shop locales failed:", error);
    return DEFAULT_LOCALE;
  }
}
