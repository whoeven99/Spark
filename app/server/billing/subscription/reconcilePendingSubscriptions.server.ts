import type { ShopifyAdminGraphqlClient } from "../../ai/skills/shopifyInfo/shopifyInfo.tool";
import prisma from "../../../db.server";
import { useNoopBillingGateway } from "../constants.server";
import {
  mapShopifySubscriptionStatus,
  shopifyFetchAppSubscription,
} from "../gateway/shopifyGraphqlBilling.server";
import { APP_SUBSCRIPTION_STATUS } from "../types.server";
import { handleAppSubscriptionWebhook } from "./handleSubscriptionWebhook.server";

/**
 * Shopify 订阅批准后若 webhook 未到（常见于 webhook 未发布或投递失败），
 * 在计费页 loader 用 Admin API 核对 PENDING 订阅并补激活。
 */
export async function reconcilePendingSubscriptions(params: {
  shop: string;
  admin: ShopifyAdminGraphqlClient;
}): Promise<void> {
  if (useNoopBillingGateway()) return;

  const pending = await prisma.appSubscription.findUnique({
    where: { shop: params.shop },
  });
  if (!pending || pending.status !== APP_SUBSCRIPTION_STATUS.PENDING) return;
  if (!pending.shopifySubscriptionId) return;

  try {
    const node = await shopifyFetchAppSubscription(
      params.admin,
      pending.shopifySubscriptionId,
    );
    if (!node) return;

    const mappedStatus = mapShopifySubscriptionStatus(node.status);
    if (mappedStatus !== APP_SUBSCRIPTION_STATUS.ACTIVE) return;

    await handleAppSubscriptionWebhook({
      shop: params.shop,
      payload: {
        app_subscription: {
          admin_graphql_api_id: pending.shopifySubscriptionId,
          status: node.status,
          name: node.name,
        },
      },
      admin: params.admin,
    });

    console.info(
      `[Billing] reconciled subscription shop=${params.shop} subscription=${pending.shopifySubscriptionId} plan=${pending.planKey}`,
    );
  } catch (error) {
    console.error(
      `[Billing] reconcile subscription failed shop=${params.shop} subscription=${pending.shopifySubscriptionId}:`,
      error,
    );
  }
}
