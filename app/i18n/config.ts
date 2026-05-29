export const SUPPORTED_LOCALES = ["en", "zh-CN", "ja", "ko", "es", "fr", "de", "it", "pt"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en";

export const LOCALE_COOKIE_NAME = "spark_locale";
export const LOCALE_STORAGE_KEY = "spark_locale";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function isSupportedLocale(value: string): value is SupportedLocale {
  return SUPPORTED_LOCALES.includes(value as SupportedLocale);
}

export function normalizeLocale(raw: string | null | undefined): SupportedLocale | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  if (lower === "en" || lower.startsWith("en-")) {
    return "en";
  }
  if (lower === "zh" || lower === "zh-cn" || lower.startsWith("zh-cn")) {
    return "zh-CN";
  }
  if (lower === "ja" || lower.startsWith("ja-")) {
    return "ja";
  }
  if (lower === "ko" || lower.startsWith("ko-")) {
    return "ko";
  }
  if (lower === "es" || lower.startsWith("es-")) {
    return "es";
  }
  if (lower === "fr" || lower.startsWith("fr-")) {
    return "fr";
  }
  if (lower === "de" || lower.startsWith("de-")) {
    return "de";
  }
  if (lower === "it" || lower.startsWith("it-")) {
    return "it";
  }
  // pt、pt-BR、pt-PT 等统一映射到应用内单一 pt 资源包。
  if (lower === "pt" || lower.startsWith("pt-")) {
    return "pt";
  }

  return isSupportedLocale(trimmed) ? trimmed : null;
}

export function buildLocaleCookieHeader(locale: SupportedLocale): string {
  return `${LOCALE_COOKIE_NAME}=${encodeURIComponent(locale)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}
