import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/tool";
import prisma from "../../db.server";
import { useNoopBillingGateway } from "./constants.server";
import {
  shopifyFetchAppPurchaseOneTime,
  shopifyFetchAppSubscription,
} from "./gateway/shopifyGraphqlBilling.server";
import { getPlanByKey } from "./plans/planCatalog.server";
import { applyTokenPackPurchase } from "./purchase/applyTokenPack.server";
import { handleAppSubscriptionWebhook } from "./subscription/handleSubscriptionWebhook.server";
import { APP_SUBSCRIPTION_STATUS, BILLING_LOG_EVENT } from "./types.server";

const LOG = "[Billing][Sync]";

/**
 * 计费页回跳时主动对账：webhook 未投递或延迟时，用 Admin API 查 Shopify 状态并补入账/通知。
 */
export async function syncPendingBillingFromShopify(params: {
  shop: string;
  appName: string;
  admin: ShopifyAdminGraphqlClient;
}): Promise<void> {
  if (useNoopBillingGateway()) return;

  const { shop, appName, admin } = params;

  try {
    await syncPendingTokenPacks({ shop, appName, admin });
    await syncPendingSubscription({ shop, appName, admin });
  } catch (error) {
    console.error(`${LOG} failed shop=${shop} appName=${appName}:`, error);
  }
}

async function syncPendingTokenPacks(params: {
  shop: string;
  appName: string;
  admin: ShopifyAdminGraphqlClient;
}): Promise<void> {
  const initiated = await prisma.billingLog.findMany({
    where: {
      shop: params.shop,
      appName: params.appName,
      eventType: BILLING_LOG_EVENT.TOKEN_PACK_INITIATED,
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  for (const log of initiated) {
    const purchaseId = log.referenceId;
    const planKey = log.planKey;
    if (!purchaseId || !planKey) continue;

    const purchased = await prisma.billingLog.findFirst({
      where: {
        shop: params.shop,
        appName: params.appName,
        eventType: BILLING_LOG_EVENT.TOKEN_PACK_PURCHASED,
        referenceId: purchaseId,
      },
    });
    if (purchased) continue;

    const node = await shopifyFetchAppPurchaseOneTime(params.admin, purchaseId);
    const status = (node?.status ?? "").toUpperCase();
    console.info(
      `${LOG} token-pack shop=${params.shop} purchaseId=${purchaseId} shopifyStatus=${status || "(none)"}`,
    );

    if (status !== "ACTIVE") continue;

    const plan = await getPlanByKey(planKey);
    console.info(
      `${LOG} token-pack-apply shop=${params.shop} purchaseId=${purchaseId} planKey=${planKey}`,
    );
    await applyTokenPackPurchase({
      shop: params.shop,
      appName: params.appName,
      plan,
      shopifyPurchaseId: purchaseId,
      metadata: { syncedFromShopify: true },
    });
  }
}

async function syncPendingSubscription(params: {
  shop: string;
  appName: string;
  admin: ShopifyAdminGraphqlClient;
}): Promise<void> {
  const sub = await prisma.appSubscription.findUnique({
    where: { shop_appName: { shop: params.shop, appName: params.appName } },
  });
  if (!sub || sub.status !== APP_SUBSCRIPTION_STATUS.PENDING) return;

  const node = await shopifyFetchAppSubscription(
    params.admin,
    sub.shopifySubscriptionId,
  );
  const status = (node?.status ?? "").toUpperCase();
  console.info(
    `${LOG} subscription shop=${params.shop} subscriptionId=${sub.shopifySubscriptionId} shopifyStatus=${status || "(none)"}`,
  );

  if (status !== "ACTIVE") return;

  console.info(
    `${LOG} subscription-activate shop=${params.shop} subscriptionId=${sub.shopifySubscriptionId}`,
  );
  await handleAppSubscriptionWebhook({
    shop: params.shop,
    appName: params.appName,
    admin: params.admin,
    payload: {
      app_subscription: {
        admin_graphql_api_id: sub.shopifySubscriptionId,
        status: node!.status,
        name: node!.name,
      },
    },
  });
}
