/** 与 `CommonEventLog.eventType` 一致 */
export const COMMON_EVENT_TYPE = {
  /** OAuth 完成 / 首次获得 session（Shopify 无 app/installed webhook） */
  APP_INSTALLED: "APP_INSTALLED",
  APP_UNINSTALLED: "APP_UNINSTALLED",
  SCOPES_UPDATE: "SCOPES_UPDATE",
} as const;

export type CommonEventType =
  (typeof COMMON_EVENT_TYPE)[keyof typeof COMMON_EVENT_TYPE];
