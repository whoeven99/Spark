/** 与 `BillingLog.eventType` 一致 */
export const BILLING_LOG_EVENT = {
  TRIAL_GRANTED: "TRIAL_GRANTED",
  SUBSCRIPTION_ACTIVATED: "SUBSCRIPTION_ACTIVATED",
  SUBSCRIPTION_RENEWED: "SUBSCRIPTION_RENEWED",
  SUBSCRIPTION_CANCELLED: "SUBSCRIPTION_CANCELLED",
  /** 一次性购包已发起，待商家确认 */
  TOKEN_PACK_INITIATED: "TOKEN_PACK_INITIATED",
  TOKEN_PACK_PURCHASED: "TOKEN_PACK_PURCHASED",
  /** 营销活动领取 Token（referenceId = campaignId） */
  PROMO_TOKEN_CLAIMED: "PROMO_TOKEN_CLAIMED",
  /** Admin 手动发放/调整按量 Token（系统奖励） */
  SYSTEM_REWARD: "SYSTEM_REWARD",
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
  /** Shopify 拒绝扣款；本地主行一般不长期停在此（清 pending / 删首次 PENDING） */
  DECLINED: "DECLINED",
} as const;

/** Shopify `appSubscriptionCreate.replacementBehavior` */
export const APP_SUBSCRIPTION_REPLACEMENT_BEHAVIOR = {
  APPLY_IMMEDIATELY: "APPLY_IMMEDIATELY",
  APPLY_ON_NEXT_BILLING_CYCLE: "APPLY_ON_NEXT_BILLING_CYCLE",
  STANDARD: "STANDARD",
} as const;

export type AppSubscriptionReplacementBehavior =
  (typeof APP_SUBSCRIPTION_REPLACEMENT_BEHAVIOR)[keyof typeof APP_SUBSCRIPTION_REPLACEMENT_BEHAVIOR];

export type AppSubscriptionStatus =
  (typeof APP_SUBSCRIPTION_STATUS)[keyof typeof APP_SUBSCRIPTION_STATUS];
