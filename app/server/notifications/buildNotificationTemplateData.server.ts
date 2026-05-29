import type {
  BaseNotificationVariables,
  CreditAccountChange,
  NotificationAppConfig,
} from "./types";

function str(value: string | number | null | undefined): string {
  if (value == null) return "";
  const text = String(value).trim();
  return text;
}

function purchaseTypeLabel(
  type: "subscription" | "creditPack" | "oneTime" | undefined,
): string {
  if (type === "subscription") return "订阅计费";
  if (type === "creditPack") return "积分购买";
  if (type === "oneTime") return "一次性购买";
  return "";
}

function formatUsdAmount(amountUsd: string | undefined): string {
  if (!amountUsd?.trim()) return "";
  return `USD ${amountUsd.trim()}`;
}

function appendCreditFields(
  data: Record<string, string>,
  change: CreditAccountChange | undefined,
): void {
  if (!change) {
    data.creditsChanged = "";
    data.creditsBefore = "";
    data.creditsAfter = "";
    data.creditUnit = "";
    data.creditReason = "";
    return;
  }
  data.creditsChanged = str(change.creditsChanged);
  data.creditsBefore = str(change.creditsBefore);
  data.creditsAfter = str(change.creditsAfter);
  data.creditUnit = str(change.creditUnit) || "credits";
  data.creditReason = str(change.reason);
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
    billingPeriod?: string;
    previousPlanName?: string;
    currentPlanName?: string;
    effectiveAtUtc?: string;
    creditAccountChange?: CreditAccountChange;
  },
): Record<string, string> {
  const appName = str(variables.appName) || appConfig.appName;
  const brandName = str(variables.brandName) || appConfig.brandName || appName;

  const data: Record<string, string> = {
    appName,
    brandName,
    appIconUrl: str(variables.appIconUrl) || str(appConfig.appIconUrl),
    recipientName: str(variables.recipientName) || "商家",
    supportEmail: str(variables.supportEmail) || appConfig.supportEmail,
    dashboardUrl: str(variables.dashboardUrl) || str(appConfig.dashboardUrl),
    helpCenterUrl: str(variables.helpCenterUrl) || str(appConfig.helpCenterUrl),
    shopName: str(variables.shopName),
    shopDomain: str(variables.shopDomain),
    occurredAtUtc: str(variables.occurredAtUtc),
    installedAtUtc: str(variables.installedAtUtc),
    uninstalledAtUtc: str(variables.uninstalledAtUtc),
    purchaseType: purchaseTypeLabel(variables.purchaseType),
    orderId: str(variables.orderId),
    planName: str(variables.planName),
    amountUsd: formatUsdAmount(variables.amountUsd),
    billingPeriod: str(variables.billingPeriod),
    previousPlanName: str(variables.previousPlanName),
    currentPlanName: str(variables.currentPlanName),
    effectiveAtUtc: str(variables.effectiveAtUtc),
  };

  appendCreditFields(data, variables.creditAccountChange);
  return data;
}
