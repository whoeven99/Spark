/** PSI `locale` values aligned with Lighthouse i18n packs (pseudo-locales excluded). */
export const PAGE_SPEED_LOCALES = [
  { code: "ar", nativeLabel: "العربية" },
  { code: "bg", nativeLabel: "Български" },
  { code: "ca", nativeLabel: "Català" },
  { code: "cs", nativeLabel: "Čeština" },
  { code: "da", nativeLabel: "Dansk" },
  { code: "de", nativeLabel: "Deutsch" },
  { code: "el", nativeLabel: "Ελληνικά" },
  { code: "en", nativeLabel: "English" },
  { code: "en-GB", nativeLabel: "English (UK)" },
  { code: "es", nativeLabel: "Español" },
  { code: "es-419", nativeLabel: "Español (Latinoamérica)" },
  { code: "fi", nativeLabel: "Suomi" },
  { code: "fil", nativeLabel: "Filipino" },
  { code: "fr", nativeLabel: "Français" },
  { code: "he", nativeLabel: "עברית" },
  { code: "hi", nativeLabel: "हिन्दी" },
  { code: "hr", nativeLabel: "Hrvatski" },
  { code: "hu", nativeLabel: "Magyar" },
  { code: "id", nativeLabel: "Bahasa Indonesia" },
  { code: "it", nativeLabel: "Italiano" },
  { code: "ja", nativeLabel: "日本語" },
  { code: "ko", nativeLabel: "한국어" },
  { code: "lt", nativeLabel: "Lietuvių" },
  { code: "lv", nativeLabel: "Latviešu" },
  { code: "nl", nativeLabel: "Nederlands" },
  { code: "no", nativeLabel: "Norsk" },
  { code: "pl", nativeLabel: "Polski" },
  { code: "pt-BR", nativeLabel: "Português (Brasil)" },
  { code: "pt-PT", nativeLabel: "Português (Portugal)" },
  { code: "ro", nativeLabel: "Română" },
  { code: "ru", nativeLabel: "Русский" },
  { code: "sk", nativeLabel: "Slovenčina" },
  { code: "sl", nativeLabel: "Slovenščina" },
  { code: "sr", nativeLabel: "Српски" },
  { code: "sr-Latn", nativeLabel: "Srpski (latinica)" },
  { code: "sv", nativeLabel: "Svenska" },
  { code: "ta", nativeLabel: "தமிழ்" },
  { code: "te", nativeLabel: "తెలుగు" },
  { code: "th", nativeLabel: "ไทย" },
  { code: "tr", nativeLabel: "Türkçe" },
  { code: "uk", nativeLabel: "Українська" },
  { code: "vi", nativeLabel: "Tiếng Việt" },
  { code: "zh-CN", nativeLabel: "中文（简体）" },
  { code: "zh-HK", nativeLabel: "中文（香港）" },
  { code: "zh-TW", nativeLabel: "中文（繁體）" },
] as const;

export type PageSpeedLocaleCode = (typeof PAGE_SPEED_LOCALES)[number]["code"];

const LOCALE_CODES = new Set<string>(PAGE_SPEED_LOCALES.map((item) => item.code));

export function isPageSpeedLocale(value: string): value is PageSpeedLocaleCode {
  return LOCALE_CODES.has(value);
}

export function resolvePageSpeedLocale(
  raw: string | null | undefined,
  fallback: PageSpeedLocaleCode = "en",
): PageSpeedLocaleCode {
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  if (isPageSpeedLocale(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  if (lower === "zh" || lower.startsWith("zh-cn")) return "zh-CN";
  if (lower.startsWith("zh-tw")) return "zh-TW";
  if (lower.startsWith("zh-hk")) return "zh-HK";
  if (lower.startsWith("pt-br") || lower === "pt") return "pt-BR";
  if (lower.startsWith("pt-pt")) return "pt-PT";
  if (lower === "en" || lower.startsWith("en-")) return "en";
  return fallback;
}

export function defaultPageSpeedLocaleFromApp(appLocale: string): PageSpeedLocaleCode {
  return resolvePageSpeedLocale(appLocale, "en");
}

export function pageSpeedLocaleNativeLabel(code: string): string {
  const match = PAGE_SPEED_LOCALES.find((item) => item.code === code);
  return match?.nativeLabel ?? code;
}
