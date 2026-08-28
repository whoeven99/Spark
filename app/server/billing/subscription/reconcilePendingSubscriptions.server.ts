import type { ShopifyAdminGraphqlClient } from "../../ai/skills/shopifyInfo/shopifyInfo.tool";
import prisma from "../../../db.server";
import { useNoopBillingGateway } from "../constants.server";
import {
  mapShopifySubscriptionStatus,
  shopifyFetchAppSubscription,
} from "../gateway/shopifyGraphqlBilling.server";
import { APP_SUBSCRIPTION_STATUS } from "../types.server";
import { handleAppSubscriptionWebhook } from "./handleSubscriptionWebhook.server";
import { handleDeclinedSubscriptionCheckout } from "./pendingPlanChange.server";

export type ReconcileSubscriptionResult = {
  activated: boolean;
  clearedDeclined: boolean;
  stillPending: boolean;
};

const EMPTY_RESULT: ReconcileSubscriptionResult = {
  activated: false,
  clearedDeclined: false,
  stillPending: false,
};

async function reconcileOneShopifyId(params: {
  shop: string;
  admin: ShopifyAdminGraphqlClient;
  shopifySubscriptionId: string;
  planKeyHint: string | null;
}): Promise<ReconcileSubscriptionResult> {
  try {
    const node = await shopifyFetchAppSubscription(
      params.admin,
      params.shopifySubscriptionId,
    );
    if (!node) {
      const declined = await handleDeclinedSubscriptionCheckout({
        shop: params.shop,
        shopifySubscriptionId: params.shopifySubscriptionId,
      });
      return {
        activated: false,
        clearedDeclined: declined !== "noop",
        stillPending: false,
      };
    }

    const mappedStatus = mapShopifySubscriptionStatus(node.status);

    if (mappedStatus === APP_SUBSCRIPTION_STATUS.ACTIVE) {
      await handleAppSubscriptionWebhook({
        shop: params.shop,
        payload: {
          app_subscription: {
            admin_graphql_api_id: params.shopifySubscriptionId,
            status: node.status,
            name: node.name,
          },
        },
        admin: params.admin,
      });
      console.info(
        `[Billing] reconciled subscription shop=${params.shop} subscription=${params.shopifySubscriptionId} plan=${params.planKeyHint ?? "(unknown)"}`,
      );
      return { activated: true, clearedDeclined: false, stillPending: false };
    }

    if (
      mappedStatus === APP_SUBSCRIPTION_STATUS.DECLINED ||
      mappedStatus === APP_SUBSCRIPTION_STATUS.EXPIRED ||
      mappedStatus === APP_SUBSCRIPTION_STATUS.CANCELLED
    ) {
      const declined = await handleDeclinedSubscriptionCheckout({
        shop: params.shop,
        shopifySubscriptionId: params.shopifySubscriptionId,
      });
      // 首次 PENDING 的 CANCELLED/EXPIRED：若 handleDeclined 未删（仅 pending 匹配），
      // 对主行 PENDING 再走 webhook DECLINED 语义
      if (declined === "noop") {
        await handleAppSubscriptionWebhook({
          shop: params.shop,
          payload: {
            app_subscription: {
              admin_graphql_api_id: params.shopifySubscriptionId,
              status: "DECLINED",
              name: node.name,
            },
          },
          admin: params.admin,
        });
      }
      return {
        activated: false,
        clearedDeclined: true,
        stillPending: false,
      };
    }

    if (mappedStatus === APP_SUBSCRIPTION_STATUS.PENDING) {
      return { activated: false, clearedDeclined: false, stillPending: true };
    }

    return EMPTY_RESULT;
  } catch (error) {
    console.error(
      `[Billing] reconcile subscription failed shop=${params.shop} subscription=${params.shopifySubscriptionId}:`,
      error,
    );
    return EMPTY_RESULT;
  }
}

/**
 * Shopify 订阅批准后若 webhook 未到（常见于 webhook 未发布或投递失败），
 * 在计费页 loader 用 Admin API 核对 pending 换套餐 / 首次 PENDING 并补激活或清拒绝。
 */
export async function reconcilePendingSubscriptions(params: {
  shop: string;
  admin: ShopifyAdminGraphqlClient;
}): Promise<ReconcileSubscriptionResult> {
  if (useNoopBillingGateway()) return EMPTY_RESULT;

  const row = await prisma.appSubscription.findUnique({
    where: { shop: params.shop },
  });
  if (!row) return EMPTY_RESULT;

  if (row.pendingShopifySubscriptionId) {
    return reconcileOneShopifyId({
      shop: params.shop,
      admin: params.admin,
      shopifySubscriptionId: row.pendingShopifySubscriptionId,
      planKeyHint: row.pendingPlanKey,
    });
  }

  if (row.status !== APP_SUBSCRIPTION_STATUS.PENDING) {
    return EMPTY_RESULT;
  }
  if (!row.shopifySubscriptionId) return EMPTY_RESULT;

  return reconcileOneShopifyId({
    shop: params.shop,
    admin: params.admin,
    shopifySubscriptionId: row.shopifySubscriptionId,
    planKeyHint: row.planKey,
  });
}
