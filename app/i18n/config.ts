export const SUPPORTED_LOCALES = ["en", "zh-CN"] as const;

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

  const lower = trimmed.toLowerCase().replace(/_/g, "-");
  if (lower === "en" || lower.startsWith("en-")) {
    return "en";
  }
  // UI 仅有简体资源：任意中文 tag（含 zh-TW）都映射到 zh-CN
  if (lower === "zh" || lower.startsWith("zh-")) {
    return "zh-CN";
  }

  return isSupportedLocale(trimmed) ? trimmed : null;
}

/**
 * 店铺主语言 → UI/AI 语言：中文用 zh-CN，其余一律英文。
 */
export function mapShopLocaleToUiLocale(
  shopLocale: string | null | undefined,
): SupportedLocale {
  const trimmed = shopLocale?.trim();
  if (!trimmed) {
    return DEFAULT_LOCALE;
  }
  const lower = trimmed.toLowerCase().replace(/_/g, "-");
  if (lower === "zh" || lower.startsWith("zh-")) {
    return "zh-CN";
  }
  return "en";
}

export function buildLocaleCookieHeader(locale: SupportedLocale): string {
  return `${LOCALE_COOKIE_NAME}=${encodeURIComponent(locale)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}
