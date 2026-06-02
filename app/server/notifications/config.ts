import { loadEmailConfig } from "../email/config/emailConfig.server";
import { getAppEntry, isAppEntryKey } from "../../config/appEntry.server";
import type { NotificationAppConfig } from "./types";
function resolveSupportEmail(): string {
  const fromEnv = process.env.TENCENT_FROM_EMAIL?.trim();
  if (fromEnv) return fromEnv;
  const config = loadEmailConfig();
  return config.tencent?.fromEmail ?? "support@msg.ciwi.ai";
}

function buildConfigForAppKey(appKey: string): NotificationAppConfig {
  const entry = isAppEntryKey(appKey) ? appKey : getAppEntry();
  const displayName =
    process.env.NOTIFICATION_APP_NAME?.trim() || entry;

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
