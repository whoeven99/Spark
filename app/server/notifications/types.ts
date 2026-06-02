import type { CreditReasonKey } from "./formatNotificationDisplay.server";

export const notificationLocales = ["zh-CN", "en"] as const;

export type NotificationLocale = (typeof notificationLocales)[number];

export type NotificationEvent =
  | "appInstalled"
  | "appUninstalled"
  | "purchaseCreated"
  | "subscriptionStarted"
  | "subscriptionChanged"
  | "subscriptionCanceled"
  | "taskStarted"
  | "taskCompleted"
  | "taskPaused"
  | "taskFailed";

export type NotificationAppConfig = {
  appKey: string;
  appName: string;
  supportEmail: string;
  brandName?: string;
  helpCenterUrl?: string;
  legalName?: string;
};

export type { CreditReasonKey };

export type CreditAccountChange = {
  creditsChanged?: string | number;
  creditsBefore?: string | number;
  creditsAfter?: string | number;
  creditUnit?: string;
  /** @deprecated Prefer creditReasonKey + locale formatting in TemplateData. */
  reason?: string;
  creditReasonKey?: CreditReasonKey;
};

export type BaseNotificationVariables = {
  shopName: string;
  shopDomain: string;
  occurredAtUtc: string;
  recipientName?: string;
  appName?: string;
  brandName?: string;
  supportEmail?: string;
  helpCenterUrl?: string;
};

export type AppLifecycleNotificationVariables = BaseNotificationVariables & {
  installedAtUtc?: string;
  uninstalledAtUtc?: string;
};

export type PurchaseNotificationVariables = BaseNotificationVariables & {
  purchaseType?: "subscription" | "creditPack" | "oneTime";
  /** Raw Shopify GID; formatted in TemplateData. */
  orderId?: string;
  planName?: string;
  amountUsd?: string;
  /** Raw billing interval for subscription; one-time uses billingPeriodKind. */
  billingInterval?: string;
  billingPeriodKind?: "oneTime";
  creditAccountChange?: CreditAccountChange;
};

export type SubscriptionNotificationVariables = BaseNotificationVariables & {
  currentPlanName: string;
  previousPlanName?: string;
  effectiveAtUtc?: string;
  /** Raw interval (MONTHLY, EVERY_30_DAYS, ANNUAL); localized in TemplateData. */
  billingInterval?: string;
  creditAccountChange?: CreditAccountChange;
};

export type TaskNotificationVariables = BaseNotificationVariables & {
  taskName: string;
  taskType?: string;
  taskId?: string;
  startedAtUtc?: string;
  completedAtUtc?: string;
  pausedAtUtc?: string;
  failureReason?: string;
  creditAccountChange?: CreditAccountChange;
};

export type NotificationVariablesByEvent = {
  appInstalled: AppLifecycleNotificationVariables;
  appUninstalled: AppLifecycleNotificationVariables;
  purchaseCreated: PurchaseNotificationVariables;
  subscriptionStarted: SubscriptionNotificationVariables;
  subscriptionChanged: SubscriptionNotificationVariables;
  subscriptionCanceled: SubscriptionNotificationVariables;
  taskStarted: TaskNotificationVariables;
  taskCompleted: TaskNotificationVariables;
  taskPaused: TaskNotificationVariables;
  taskFailed: TaskNotificationVariables;
};

export type RenderNotificationInput<E extends NotificationEvent> = {
  event: E;
  appConfig: NotificationAppConfig;
  variables: NotificationVariablesByEvent[E];
  locale?: NotificationLocale;
};

export type RenderedNotificationEmail = {
  subject: string;
  html: string;
  text: string;
};
