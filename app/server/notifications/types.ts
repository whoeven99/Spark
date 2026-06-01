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

export type CreditAccountChange = {
  creditsChanged?: string | number;
  creditsBefore?: string | number;
  creditsAfter?: string | number;
  creditUnit?: string;
  reason?: string;
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
  orderId?: string;
  planName?: string;
  amountUsd?: string;
  billingPeriod?: string;
  creditAccountChange?: CreditAccountChange;
};

export type SubscriptionNotificationVariables = BaseNotificationVariables & {
  currentPlanName: string;
  previousPlanName?: string;
  effectiveAtUtc?: string;
  billingPeriod?: string;
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
