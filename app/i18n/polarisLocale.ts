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
  return "en";
}
