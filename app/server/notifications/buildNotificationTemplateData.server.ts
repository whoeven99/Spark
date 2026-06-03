import {
  getAppEntry,
  getAppHomePath,
  isAppEntryKey,
  type AppEntry,
} from "../../config/appEntry.server";
import {
  defaultRecipientFallback,
  formatBillingPeriod,
  formatCreditAmount,
  formatCreditReason,
  formatPurchaseType,
  formatShopifyOrderDisplayId,
  formatUsdDisplay,
} from "./formatNotificationDisplay.server";
import type {
  BaseNotificationVariables,
  CreditAccountChange,
  NotificationAppConfig,
  NotificationLocale,
} from "./types";

function str(value: string | number | null | undefined): string {
  if (value == null) return "";
  const text = String(value).trim();
  return text;
}

function resolveBillingPeriod(
  variables: {
    purchaseType?: "subscription" | "creditPack" | "oneTime";
    billingInterval?: string;
    billingPeriodKind?: "oneTime";
  },
  locale: NotificationLocale,
): string {
  if (variables.billingPeriodKind === "oneTime") {
    return formatBillingPeriod({ kind: "oneTime" }, locale);
  }
  if (variables.billingInterval?.trim()) {
    return formatBillingPeriod(
      { kind: "subscription", interval: variables.billingInterval },
      locale,
    );
  }
  if (variables.purchaseType === "creditPack" || variables.purchaseType === "oneTime") {
    return formatBillingPeriod({ kind: "oneTime" }, locale);
  }
  return "";
}

function appendCreditFields(
  data: Record<string, string>,
  change: CreditAccountChange | undefined,
  locale: NotificationLocale,
): void {
  if (!change) {
    data.creditsChanged = "";
    data.creditsBefore = "";
    data.creditsAfter = "";
    data.creditUnit = "";
    data.creditReason = "";
    return;
  }

  data.creditsChanged =
    change.creditsChanged === undefined
      ? ""
      : formatCreditAmount(change.creditsChanged);
  data.creditsBefore =
    change.creditsBefore === undefined
      ? ""
      : formatCreditAmount(change.creditsBefore);
  data.creditsAfter =
    change.creditsAfter === undefined
      ? ""
      : formatCreditAmount(change.creditsAfter);
  data.creditUnit = "";
  data.creditReason =
    formatCreditReason(change.creditReasonKey, locale) ||
    str(change.reason);
}

function resolveShopAdminIdentifier(shopDomain: string | undefined): string {
  const normalized = str(shopDomain)
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/\.myshopify\.com$/i, "");
  return normalized;
}

/** 邮件 Admin 链接 apps 路径段；与内嵌路由 home 可能不一致。 */
const SHOPIFY_ADMIN_APP_PATH_BY_ENTRY: Partial<Record<AppEntry, string>> = {
  "product-improve": "ciwi-ai-product-improve/app/product-improve",
};

function resolveAppAdminPath(appKey: string | undefined): string {
  const entry = appKey && isAppEntryKey(appKey) ? appKey : getAppEntry();
  const mapped = SHOPIFY_ADMIN_APP_PATH_BY_ENTRY[entry];
  if (mapped) return mapped;
  return getAppHomePath(entry).split("?")[0].replace(/^\/+/, "");
}

/**
 * 扁平 TemplateData，键名与 tencent-cloud-html/zh-CN/*.html 中 {{var}} 一致。
 */
export function buildNotificationTemplateData(
  appConfig: NotificationAppConfig,
  variables: BaseNotificationVariables & {
    installedAtUtc?: string;
    uninstalledAtUtc?: string;
    purchaseType?: "subscription" | "creditPack" | "oneTime";
    orderId?: string;
    planName?: string;
    amountUsd?: string;
    billingInterval?: string;
    billingPeriodKind?: "oneTime";
    previousPlanName?: string;
    currentPlanName?: string;
    effectiveAtUtc?: string;
    taskName?: string;
    taskId?: string;
    startedAtUtc?: string;
    completedAtUtc?: string;
    pausedAtUtc?: string;
    failureReason?: string;
    creditAccountChange?: CreditAccountChange;
  },
  locale: NotificationLocale = "zh-CN",
): Record<string, string> {
  const appName = str(variables.appName) || appConfig.appName;
  const brandName = str(variables.brandName) || appConfig.brandName || appName;
  const recipientFallback = defaultRecipientFallback(locale);

  const data: Record<string, string> = {
    shop_id: resolveShopAdminIdentifier(variables.shopDomain),
    path: resolveAppAdminPath(appConfig.appKey),
    appName,
    brandName,
    recipientName: str(variables.recipientName) || recipientFallback,
    supportEmail: str(variables.supportEmail) || appConfig.supportEmail,
    shopName: str(variables.shopName),
    shopDomain: str(variables.shopDomain),
    occurredAtUtc: str(variables.occurredAtUtc),
    installedAtUtc: str(variables.installedAtUtc) || str(variables.occurredAtUtc),
    uninstalledAtUtc: str(variables.uninstalledAtUtc) || str(variables.occurredAtUtc),
    purchaseType: formatPurchaseType(variables.purchaseType, locale),
    orderId: variables.orderId
      ? formatShopifyOrderDisplayId(variables.orderId)
      : "",
    planName: str(variables.planName),
    amountUsd: formatUsdDisplay(variables.amountUsd),
    billingPeriod: resolveBillingPeriod(variables, locale),
    previousPlanName: str(variables.previousPlanName),
    currentPlanName: str(variables.currentPlanName),
    effectiveAtUtc: str(variables.effectiveAtUtc) || str(variables.occurredAtUtc),
    taskName: str(variables.taskName),
    taskId: str(variables.taskId),
    startedAtUtc: str(variables.startedAtUtc) || str(variables.occurredAtUtc),
    completedAtUtc: str(variables.completedAtUtc) || str(variables.occurredAtUtc),
    pausedAtUtc: str(variables.pausedAtUtc) || str(variables.occurredAtUtc),
    failureReason: str(variables.failureReason),
  };

  appendCreditFields(data, variables.creditAccountChange, locale);
  return data;
}
