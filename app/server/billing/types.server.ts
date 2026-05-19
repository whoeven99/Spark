/** 与 `BillingLog.eventType` 一致 */
export const BILLING_LOG_EVENT = {
  TRIAL_GRANTED: "TRIAL_GRANTED",
  SUBSCRIPTION_ACTIVATED: "SUBSCRIPTION_ACTIVATED",
  SUBSCRIPTION_RENEWED: "SUBSCRIPTION_RENEWED",
  /** 一次性购包已发起，待商家确认 */
  TOKEN_PACK_INITIATED: "TOKEN_PACK_INITIATED",
  TOKEN_PACK_PURCHASED: "TOKEN_PACK_PURCHASED",
} as const;

export type BillingLogEventType =
  (typeof BILLING_LOG_EVENT)[keyof typeof BILLING_LOG_EVENT];

/** 与 `PlanCatalog.kind` 一致 */
export const PLAN_CATALOG_KIND = {
  SUBSCRIPTION: "SUBSCRIPTION",
  ONE_TIME_PACK: "ONE_TIME_PACK",
  INTERNAL_TRIAL: "INTERNAL_TRIAL",
} as const;

export type PlanCatalogKind =
  (typeof PLAN_CATALOG_KIND)[keyof typeof PLAN_CATALOG_KIND];

/** 与 `AppSubscription.status` 一致 */
export const APP_SUBSCRIPTION_STATUS = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
  FROZEN: "FROZEN",
} as const;

export type AppSubscriptionStatus =
  (typeof APP_SUBSCRIPTION_STATUS)[keyof typeof APP_SUBSCRIPTION_STATUS];
