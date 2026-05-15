import type { SupportedLocale } from "./config";

export type PolarisLocaleCode = "en" | "zh-CN" | "ja" | "ko";

export function mapToPolarisLocale(locale: SupportedLocale): PolarisLocaleCode {
  if (locale === "zh-CN") {
    return "zh-CN";
  }
  if (locale === "ja") {
    return "ja";
  }
  if (locale === "ko") {
    return "ko";
  }
  // de / es / fr / it / pt：嵌入式 Admin 与当前 Polaris 资源包未对齐到独立语言码时，回退到英文以避免类型或运行时缺口。
  if (locale === "de" || locale === "es" || locale === "fr" || locale === "it" || locale === "pt") {
    return "en";
  }
  return "en";
}
