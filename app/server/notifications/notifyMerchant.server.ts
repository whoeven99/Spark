import type { PlanRecord } from "../billing/plans/planCatalog.server";
import {
  loadSessionSnapshotForUninstall,
  type UninstallSessionSnapshot,
} from "../commonEventLog/loadSessionSnapshotForUninstall.server";
import {
  buildAppInstalledVariables,
  buildAppUninstalledVariables,
  buildPurchaseCreatedVariables,
  buildSubscriptionVariables,
  formatOccurredAtUtc,
} from "./buildNotificationVariables.server";
import { dispatchMerchantNotificationEmail } from "./sendMerchantNotificationEmail.server";

const LOG = "[MerchantEmail]";

/** 从 Session 表读取收件人/语言快照（容错，失败返回 null）。 */
async function loadRecipient(
  shop: string,
  sessionId?: string,
): Promise<UninstallSessionSnapshot | null> {
  try {
    return await loadSessionSnapshotForUninstall(shop, sessionId);
  } catch (error) {
    console.warn(`${LOG} load recipient snapshot failed shop=${shop}:`, error);
    return null;
  }
}

/** 安装成功邮件。 */
export async function notifyAppInstalledEmail(params: {
  shop: string;
  appName: string;
  installedAt: Date;
  sessionId?: string;
}): Promise<void> {
  try {
    const recipient = await loadRecipient(params.shop, params.sessionId);
    const variables = buildAppInstalledVariables({
      shop: params.shop,
      installedAt: params.installedAt,
      sessionSnapshot: recipient,
    });
    await dispatchMerchantNotificationEmail({
      event: "appInstalled",
      shop: params.shop,
      appName: params.appName,
      variables,
      recipient,
    });
  } catch (error) {
    console.error(`${LOG} notifyAppInstalledEmail failed shop=${params.shop}:`, error);
  }
}

/**
 * 卸载邮件。卸载后 Shopify token 失效，必须在删除 Session 之前调用（或传入已加载的 recipient）。
 */
export async function notifyAppUninstalledEmail(params: {
  shop: string;
  appName: string;
  uninstalledAt: Date;
  sessionId?: string;
  recipient?: UninstallSessionSnapshot | null;
}): Promise<void> {
  try {
    const recipient =
      params.recipient !== undefined
        ? params.recipient
        : await loadRecipient(params.shop, params.sessionId);
    const variables = buildAppUninstalledVariables({
      shop: params.shop,
      uninstalledAt: params.uninstalledAt,
      sessionSnapshot: recipient,
    });
    await dispatchMerchantNotificationEmail({
      event: "appUninstalled",
      shop: params.shop,
      appName: params.appName,
      variables,
      recipient,
    });
  } catch (error) {
    console.error(`${LOG} notifyAppUninstalledEmail failed shop=${params.shop}:`, error);
  }
}

/** 一次性购买/订单支付成功邮件。 */
export async function notifyPurchaseCreatedEmail(params: {
  shop: string;
  appName: string;
  plan: PlanRecord;
  shopifyPurchaseId: string;
  occurredAt: Date;
}): Promise<void> {
  try {
    const recipient = await loadRecipient(params.shop);
    const variables = buildPurchaseCreatedVariables({
      shop: params.shop,
      occurredAt: params.occurredAt,
      plan: params.plan,
      shopifyPurchaseId: params.shopifyPurchaseId,
      sessionSnapshot: recipient,
    });
    await dispatchMerchantNotificationEmail({
      event: "purchaseCreated",
      shop: params.shop,
      appName: params.appName,
      variables,
      recipient,
    });
  } catch (error) {
    console.error(`${LOG} notifyPurchaseCreatedEmail failed shop=${params.shop}:`, error);
  }
}

/** 订阅开通/变更/取消邮件。 */
export async function notifySubscriptionEmail(params: {
  shop: string;
  appName: string;
  event: "subscriptionStarted" | "subscriptionChanged" | "subscriptionCanceled";
  currentPlanName: string;
  previousPlanName?: string;
  billingInterval?: string;
  occurredAt: Date;
}): Promise<void> {
  try {
    const recipient = await loadRecipient(params.shop);
    const variables = buildSubscriptionVariables({
      shop: params.shop,
      occurredAt: params.occurredAt,
      currentPlanName: params.currentPlanName,
      previousPlanName: params.previousPlanName,
      effectiveAtUtc: formatOccurredAtUtc(params.occurredAt),
      billingInterval: params.billingInterval,
      sessionSnapshot: recipient,
    });
    await dispatchMerchantNotificationEmail({
      event: params.event,
      shop: params.shop,
      appName: params.appName,
      variables,
      recipient,
    });
  } catch (error) {
    console.error(`${LOG} notifySubscriptionEmail failed shop=${params.shop}:`, error);
  }
}
