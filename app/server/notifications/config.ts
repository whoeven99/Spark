import type { NotificationAppConfig } from "./types";

export const notificationAppConfigs: Record<string, NotificationAppConfig> = {};

export function getNotificationAppConfig(appKey: string): NotificationAppConfig {
  const config = notificationAppConfigs[appKey];

  if (!config) {
    throw new Error(`Missing notification app config for "${appKey}".`);
  }

  return config;
}
