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
import { enrichSessionSnapshotFromShopInfo } from "./enrichSessionSnapshotFromShopInfo.server";
import { fetchShopBasicInfo } from "../shopify/fetchShopBasicInfo.server";
import type { CreditAccountChange } from "./types";
import { getAppEntry } from "../../config/appEntry.server";
import prisma from "../../db.server";

const LOG = "[MerchantEmail]";

/** 从 offline session 读取缓存的 shopName（API 失败时的降级来源）。 */
async function loadCachedShopName(shop: string): Promise<string | null> {
  try {
    const appName = getAppEntry();
    const row = await prisma.session.findFirst({
      where: { shop, appName, isOnline: false },
      select: { shopName: true },
    });
    return row?.shopName ?? null;
  } catch {
    return null;
  }
}

/** 通过 offline token 拉取店铺基础信息，失败时降级到 Session 缓存，不阻断邮件发送。 */
async function loadShopInfo(shop: string) {
  // eslint-disable-next-line no-undef
  if (!process.env.SHOPIFY_APP_URL?.trim()) {
    const cachedName = await loadCachedShopName(shop);
    return cachedName ? { name: cachedName } : null;
  }
  try {
    // 懒加载 shopify.server，避免测试环境模块初始化时报 appUrl 未配置
    const { unauthenticated } = await import("../../shopify.server");
    // 加超时保护：unauthenticated.admin 在无有效 session 时可能发起网络请求
    const timeoutMs = 1500;
    const result = await Promise.race([
      unauthenticated.admin(shop).then(({ admin }) => fetchShopBasicInfo(admin)),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (result) return result;
  } catch (error) {
    console.warn(`${LOG} loadShopInfo API failed shop=${shop}:`, error);
  }
  // 降级：从 offline session 读取缓存的 shopName
  const cachedName = await loadCachedShopName(shop);
  return cachedName ? { name: cachedName } : null;
}

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
    const [recipient, shopInfo] = await Promise.all([
      loadRecipient(params.shop, params.sessionId),
      loadShopInfo(params.shop),
    ]);
    const enrichedRecipient = enrichSessionSnapshotFromShopInfo(
      recipient,
      shopInfo,
      params.shop,
    );
    const variables = buildAppInstalledVariables({
      shop: params.shop,
      installedAt: params.installedAt,
      shopInfo,
      sessionSnapshot: enrichedRecipient,
    });
    await dispatchMerchantNotificationEmail({
      event: "appInstalled",
      shop: params.shop,
      appName: params.appName,
      variables,
      recipient: enrichedRecipient,
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
    const [recipient, shopInfo] = await Promise.all([
      params.recipient !== undefined
        ? Promise.resolve(params.recipient)
        : loadRecipient(params.shop, params.sessionId),
      loadShopInfo(params.shop),
    ]);
    const enrichedRecipient = enrichSessionSnapshotFromShopInfo(
      recipient,
      shopInfo,
      params.shop,
    );
    const variables = buildAppUninstalledVariables({
      shop: params.shop,
      uninstalledAt: params.uninstalledAt,
      shopInfo,
      sessionSnapshot: enrichedRecipient,
    });
    await dispatchMerchantNotificationEmail({
      event: "appUninstalled",
      shop: params.shop,
      appName: params.appName,
      variables,
      recipient: enrichedRecipient,
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
  creditAccountChange?: CreditAccountChange;
}): Promise<void> {
  try {
    const [recipient, shopInfo] = await Promise.all([
      loadRecipient(params.shop),
      loadShopInfo(params.shop),
    ]);
    const enrichedRecipient = enrichSessionSnapshotFromShopInfo(
      recipient,
      shopInfo,
      params.shop,
    );
    const variables = buildPurchaseCreatedVariables({
      shop: params.shop,
      occurredAt: params.occurredAt,
      plan: params.plan,
      shopifyPurchaseId: params.shopifyPurchaseId,
      shopInfo,
      sessionSnapshot: enrichedRecipient,
      creditAccountChange: params.creditAccountChange,
    });
    await dispatchMerchantNotificationEmail({
      event: "purchaseCreated",
      shop: params.shop,
      appName: params.appName,
      variables,
      recipient: enrichedRecipient,
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
  creditAccountChange?: CreditAccountChange;
}): Promise<void> {
  try {
    const [recipient, shopInfo] = await Promise.all([
      loadRecipient(params.shop),
      loadShopInfo(params.shop),
    ]);
    const enrichedRecipient = enrichSessionSnapshotFromShopInfo(
      recipient,
      shopInfo,
      params.shop,
    );
    const variables = buildSubscriptionVariables({
      shop: params.shop,
      occurredAt: params.occurredAt,
      currentPlanName: params.currentPlanName,
      previousPlanName: params.previousPlanName,
      effectiveAtUtc: formatOccurredAtUtc(params.occurredAt),
      billingInterval: params.billingInterval,
      shopInfo,
      sessionSnapshot: enrichedRecipient,
      creditAccountChange: params.creditAccountChange,
    });
    await dispatchMerchantNotificationEmail({
      event: params.event,
      shop: params.shop,
      appName: params.appName,
      variables,
      recipient: enrichedRecipient,
    });
  } catch (error) {
    console.error(`${LOG} notifySubscriptionEmail failed shop=${params.shop}:`, error);
  }
}
