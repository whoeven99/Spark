import type { ShopifyAdminGraphqlClient } from "../../ai/skills/shopifyInfo/shopifyInfo.tool";
import prisma from "../../../db.server";
import {
  isBillingDevCancelEnabled,
  useNoopBillingGateway,
} from "../constants.server";
import { BillingError, BILLING_ERROR_CODE } from "../errors.server";
import { shopifyCancelAppSubscription } from "../gateway/shopifyGraphqlBilling.server";
import { APP_SUBSCRIPTION_STATUS } from "../types.server";
import { markSubscriptionNonActive } from "./activateSubscription.server";

const CANCELLABLE_STATUSES = new Set<string>([
  APP_SUBSCRIPTION_STATUS.ACTIVE,
  APP_SUBSCRIPTION_STATUS.PENDING,
]);

/**
 * 测试环境取消当前订阅：调 Shopify `appSubscriptionCancel`（非 noop），并同步本地库。
 */
export async function cancelActiveSubscription(params: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
}): Promise<void> {
  if (!isBillingDevCancelEnabled()) {
    throw new BillingError(
      "当前环境未启用测试取消订阅（需 BILLING_TEST=true 或 NODE_ENV=test）",
      BILLING_ERROR_CODE.SHOPIFY_BILLING_FAILED,
      403,
    );
  }

  const sub = await prisma.appSubscription.findUnique({
    where: { shop: params.shop },
  });

  if (!sub) {
    throw new BillingError("当前无订阅可取消", BILLING_ERROR_CODE.PLAN_NOT_FOUND, 404);
  }

  if (!CANCELLABLE_STATUSES.has(sub.status)) {
    throw new BillingError(
      `当前订阅状态为 ${sub.status}，无法取消`,
      BILLING_ERROR_CODE.SHOPIFY_BILLING_FAILED,
      400,
    );
  }

  if (!useNoopBillingGateway()) {
    await shopifyCancelAppSubscription(params.admin, sub.shopifySubscriptionId);
  }

  await markSubscriptionNonActive({
    shop: params.shop,
    shopifySubscriptionId: sub.shopifySubscriptionId,
    status: APP_SUBSCRIPTION_STATUS.CANCELLED,
    rawPayload: { source: "dev_cancel_button", noop: useNoopBillingGateway() },
  });
}
