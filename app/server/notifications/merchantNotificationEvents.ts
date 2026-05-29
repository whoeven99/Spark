import type { NotificationEvent } from "./types";

/** 商户事务邮件事件（不含 task*）。 */
export type MerchantNotificationEvent = Extract<
  NotificationEvent,
  | "appInstalled"
  | "appUninstalled"
  | "purchaseCreated"
  | "subscriptionStarted"
  | "subscriptionChanged"
  | "subscriptionCanceled"
>;

export const merchantNotificationEvents = [
  "appInstalled",
  "appUninstalled",
  "purchaseCreated",
  "subscriptionStarted",
  "subscriptionChanged",
  "subscriptionCanceled",
] as const satisfies readonly MerchantNotificationEvent[];
