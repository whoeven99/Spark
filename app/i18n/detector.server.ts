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

export function detectRequestLocale(request: Request): SupportedLocale {
  const cookieLocale = parseCookieLocale(request.headers.get("cookie"));
  if (cookieLocale) {
    return cookieLocale;
  }

  const acceptLanguageLocale = parseAcceptLanguageLocale(request.headers.get("accept-language"));
  if (acceptLanguageLocale) {
    return acceptLanguageLocale;
  }

  return DEFAULT_LOCALE;
}
