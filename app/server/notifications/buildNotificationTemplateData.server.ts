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
    creditAccountChange?: CreditAccountChange;
  },
  locale: NotificationLocale = "zh-CN",
): Record<string, string> {
  const appName = str(variables.appName) || appConfig.appName;
  const brandName = str(variables.brandName) || appConfig.brandName || appName;
  const recipientFallback = defaultRecipientFallback(locale);

  const data: Record<string, string> = {
    appName,
    brandName,
    appIconUrl: str(variables.appIconUrl) || str(appConfig.appIconUrl),
    recipientName: str(variables.recipientName) || recipientFallback,
    supportEmail: str(variables.supportEmail) || appConfig.supportEmail,
    dashboardUrl: str(variables.dashboardUrl) || str(appConfig.dashboardUrl),
    helpCenterUrl: str(variables.helpCenterUrl) || str(appConfig.helpCenterUrl),
    shopName: str(variables.shopName),
    shopDomain: str(variables.shopDomain),
    occurredAtUtc: str(variables.occurredAtUtc),
    installedAtUtc: str(variables.installedAtUtc),
    uninstalledAtUtc: str(variables.uninstalledAtUtc),
    purchaseType: formatPurchaseType(variables.purchaseType, locale),
    orderId: variables.orderId
      ? formatShopifyOrderDisplayId(variables.orderId)
      : "",
    planName: str(variables.planName),
    amountUsd: formatUsdDisplay(variables.amountUsd),
    billingPeriod: resolveBillingPeriod(variables, locale),
    previousPlanName: str(variables.previousPlanName),
    currentPlanName: str(variables.currentPlanName),
    effectiveAtUtc: str(variables.effectiveAtUtc),
  };

  appendCreditFields(data, variables.creditAccountChange, locale);
  return data;
}
