import type { Prisma } from "../../../generated/prisma";
import prisma from "../../../db.server";
import { applyTokenPackPurchase } from "../purchase/applyTokenPack.server";
import { applyActiveSubscription } from "../subscription/activateSubscription.server";
import type { BillingGateway } from "./billingGateway.types";
import { APP_SUBSCRIPTION_STATUS } from "../types.server";

const NOOP_SUBSCRIPTION_GID = "gid://shopify/AppSubscription/noop";
const NOOP_PURCHASE_GID_PREFIX = "gid://shopify/AppPurchaseOneTime/noop-";

export const noopBillingGateway: BillingGateway = {
  async createSubscription({ shop, appName, plan }) {
    const subscriptionId = `${NOOP_SUBSCRIPTION_GID}-${plan.planKey}`;
    const periodEnd = new Date();
    if (plan.billingInterval === "ANNUAL") {
      periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);
    } else {
      periodEnd.setUTCDate(periodEnd.getUTCDate() + 30);
    }

    await applyActiveSubscription({
      shop,
      appName,
      shopifySubscriptionId: subscriptionId,
      planKey: plan.planKey,
      billingInterval: plan.billingInterval ?? "MONTHLY",
      tokensPerPeriod: plan.tokens,
      period: {
        planKey: plan.planKey,
        tokensPerPeriod: plan.tokens,
        currentPeriodStart: new Date(),
        currentPeriodEnd: periodEnd,
      },
      rawPayload: { noop: true },
    });

    return {
      confirmationUrl: null,
      shopifySubscriptionId: subscriptionId,
    };
  },

  async createOneTimePurchase({ shop, appName, plan }) {
    const purchaseId = `${NOOP_PURCHASE_GID_PREFIX}${plan.planKey}-${Date.now()}`;
    await applyTokenPackPurchase({
      shop,
      appName,
      plan,
      shopifyPurchaseId: purchaseId,
      metadata: { noop: true },
    });

    return {
      confirmationUrl: null,
      shopifyPurchaseId: purchaseId,
    };
  },
};

/** Noop 模式下将 pending 订阅标记为本地 ACTIVE（开发用）。 */
export async function noopActivatePendingSubscription(
  shop: string,
  appName: string,
): Promise<void> {
  const sub = await prisma.appSubscription.findUnique({
    where: { shop_appName: { shop, appName } },
  });
  if (!sub || sub.status !== APP_SUBSCRIPTION_STATUS.PENDING) return;

  const periodEnd = new Date();
  if (sub.billingInterval === "ANNUAL") {
    periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);
  } else {
    periodEnd.setUTCDate(periodEnd.getUTCDate() + 30);
  }

  await applyActiveSubscription({
    shop,
    appName,
    shopifySubscriptionId: sub.shopifySubscriptionId,
    planKey: sub.planKey,
    billingInterval: sub.billingInterval,
    tokensPerPeriod: sub.tokensPerPeriod,
    period: {
      planKey: sub.planKey,
      tokensPerPeriod: sub.tokensPerPeriod,
      currentPeriodStart: new Date(),
      currentPeriodEnd: periodEnd,
    },
    rawPayload: { noop: true, activatedFromPending: true },
  });
}
