import { loadEmailConfig } from "../email/config/emailConfig.server";
import type { NotificationAppConfig } from "./types";

function resolveSupportEmail(): string {
  const fromEnv = process.env.TENCENT_FROM_EMAIL?.trim();
  if (fromEnv) return fromEnv;
  const config = loadEmailConfig();
  return config.tencent?.fromEmail ?? "support@msg.ciwi.ai";
}

function buildConfigForAppKey(appKey: string): NotificationAppConfig {
  const displayName = process.env.NOTIFICATION_APP_NAME?.trim() || appKey;
  return {
    appKey,
    appName: displayName,
    brandName: process.env.NOTIFICATION_BRAND_NAME?.trim() || displayName,
    supportEmail: resolveSupportEmail(),
    helpCenterUrl: process.env.NOTIFICATION_HELP_CENTER_URL?.trim() || undefined,
    legalName: process.env.NOTIFICATION_LEGAL_NAME?.trim() || undefined,
  };
}

const configCache = new Map<string, NotificationAppConfig>();

export function getNotificationAppConfig(appKey: string): NotificationAppConfig {
  const cached = configCache.get(appKey);
  if (cached) return cached;
  const config = buildConfigForAppKey(appKey);
  configCache.set(appKey, config);
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
