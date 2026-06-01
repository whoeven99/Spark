import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  type SupportedLocale,
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

function parseAcceptLanguageLocale(header: string | null): SupportedLocale | null {
  if (!header) {
    return null;
  }

  const tags = header
    .split(",")
    .map((token) => token.trim().split(";")[0])
    .filter(Boolean);

  for (const tag of tags) {
    const normalized = normalizeLocale(tag);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

/** Shopify 在线会话里员工 Admin 语言（Prisma Session.locale → associated_user.locale）。 */
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
 * 自动语言检测优先级（无用户手动选择时）：
 * 1. Cookie（LanguageSelector 写入）
 * 2. Shopify 员工 Admin locale
 * 3. Accept-Language
 * 4. 英语（DEFAULT_LOCALE）
 */
export function detectRequestLocale(
  request: Request,
  options?: { sessionLocale?: string | null },
): SupportedLocale {
  const cookieLocale = parseCookieLocale(request.headers.get("cookie"));
  if (cookieLocale) {
    return cookieLocale;
  }

  const sessionLocale = normalizeLocale(options?.sessionLocale);
  if (sessionLocale) {
    return sessionLocale;
  }

  const acceptLanguageLocale = parseAcceptLanguageLocale(request.headers.get("accept-language"));
  if (acceptLanguageLocale) {
    return acceptLanguageLocale;
  }

  return DEFAULT_LOCALE;
}
