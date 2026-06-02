import { getAppEntry, isAppEntryKey } from "../../config/appEntry.server";
import type { NotificationAppConfig } from "./types";

import { MERCHANT_SUPPORT_EMAIL } from "../email/templates/emailTemplates.server";

const DEFAULT_SUPPORT_EMAIL = MERCHANT_SUPPORT_EMAIL;

/** APP_ENTRY key → 人类可读展示名（优先级低于 NOTIFICATION_APP_NAME 环境变量）。 */
const APP_ENTRY_DISPLAY_NAMES: Partial<Record<string, string>> = {
  "product-improve": "Ciwi:ai-Product Improve",
};

function resolveSupportEmail(): string {
  return process.env.NOTIFICATION_SUPPORT_EMAIL?.trim() || DEFAULT_SUPPORT_EMAIL;
}

function buildConfigForAppKey(appKey: string): NotificationAppConfig {
  const entry = isAppEntryKey(appKey) ? appKey : getAppEntry();
  const displayName =
    process.env.NOTIFICATION_APP_NAME?.trim() ||
    APP_ENTRY_DISPLAY_NAMES[entry] ||
    entry;

  return {
    appKey: entry,
    appName: displayName,
    brandName: process.env.NOTIFICATION_BRAND_NAME?.trim() || displayName,
    supportEmail: resolveSupportEmail(),
    appIconUrl: process.env.NOTIFICATION_APP_ICON_URL?.trim() || undefined,
    dashboardUrl: undefined,
    helpCenterUrl: process.env.NOTIFICATION_HELP_CENTER_URL?.trim() || undefined,
    legalName: process.env.NOTIFICATION_LEGAL_NAME?.trim() || undefined,
  };
}

/** 按 AppEntry 缓存的商户通知配置（进程内构建）。 */
const configCache = new Map<string, NotificationAppConfig>();

export function getNotificationAppConfig(appKey: string): NotificationAppConfig {
  const key = isAppEntryKey(appKey) ? appKey : getAppEntry();
  const cached = configCache.get(key);
  if (cached) return cached;

  const config = buildConfigForAppKey(key);
  configCache.set(key, config);
  return config;
}

/** @deprecated 使用 getNotificationAppConfig；保留导出避免破坏旧引用。 */
export const notificationAppConfigs: Record<string, NotificationAppConfig> =
  new Proxy({} as Record<string, NotificationAppConfig>, {
    get(_target, prop: string) {
      if (typeof prop !== "string" || prop === "then") return undefined;
      return getNotificationAppConfig(prop);
    },
  });
