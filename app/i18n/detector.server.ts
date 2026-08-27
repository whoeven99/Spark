import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  type SupportedLocale,
  mapShopLocaleToUiLocale,
  normalizeLocale,
} from "./config";

function parseCookieLocale(cookieHeader: string | null): SupportedLocale | null {
  if (!cookieHeader) {
    return null;
  }

  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey !== LOCALE_COOKIE_NAME) {
      continue;
    }
    const rawValue = rest.join("=");
    const decoded = decodeURIComponent(rawValue);
    return normalizeLocale(decoded);
  }
  return null;
}

/** 读取请求 Cookie 中的手动语言偏好（LanguageSelector 写入）。 */
export function readManualLocaleCookie(request: Request): SupportedLocale | null {
  return parseCookieLocale(request.headers.get("cookie"));
}

/** @deprecated 保留导出以免旧引用断裂；UI 语言不再跟 Shopify 员工 Admin locale。 */
export function readShopifySessionLocale(session: unknown): string | null {
  if (!session || typeof session !== "object") {
    return null;
  }

  const onlineLocale = (
    session as {
      onlineAccessInfo?: { associated_user?: { locale?: string | null } | null } | null;
    }
  ).onlineAccessInfo?.associated_user?.locale;

  if (typeof onlineLocale === "string") {
    const trimmed = onlineLocale.trim();
    if (trimmed && trimmed !== "null") {
      return trimmed;
    }
  }

  return null;
}

/**
 * UI / AI 语言检测优先级：
 * 1. Cookie（用户手动切换，LanguageSelector 写入）
 * 2. 店铺主语言（中文 → zh-CN，否则 → en）
 * 3. 英语（DEFAULT_LOCALE）
 */
export function detectRequestLocale(
  request: Request,
  options?: {
    shopPrimaryLocale?: string | null;
    /** @deprecated 已忽略；请改传 shopPrimaryLocale */
    sessionLocale?: string | null;
  },
): SupportedLocale {
  const cookieLocale = parseCookieLocale(request.headers.get("cookie"));
  if (cookieLocale) {
    return cookieLocale;
  }

  if (options?.shopPrimaryLocale != null && options.shopPrimaryLocale !== "") {
    return mapShopLocaleToUiLocale(options.shopPrimaryLocale);
  }

  return DEFAULT_LOCALE;
}
