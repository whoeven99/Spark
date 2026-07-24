import type { SupportedLocale } from "./config";

export type PolarisLocaleCode = "en" | "zh-CN";

export function mapToPolarisLocale(locale: SupportedLocale): PolarisLocaleCode {
  if (locale === "zh-CN") {
    return "zh-CN";
  }
  return "en";
}
