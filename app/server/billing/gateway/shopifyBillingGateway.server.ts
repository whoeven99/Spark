import prisma from "../../../db.server";
import { appendBillingLog } from "../billingLog.server";
import { BILLING_LOG_EVENT } from "../types.server";
import type { BillingGateway } from "./billingGateway.types";
import {
  shopifyCreateOneTimePurchase,
  shopifyCreateSubscription,
} from "./shopifyGraphqlBilling.server";
import { APP_SUBSCRIPTION_STATUS } from "../types.server";

export const shopifyBillingGateway: BillingGateway = {
  async createSubscription({ admin, shop, plan, returnUrl, trialDays }) {
    const name = plan.shopifyPlanName ?? plan.displayName;
    const { confirmationUrl, subscriptionId } = await shopifyCreateSubscription(
      admin,
      {
        planName: name,
        priceAmount: plan.priceAmount,
        currencyCode: plan.currencyCode,
        billingInterval: plan.billingInterval,
        returnUrl,
        trialDays: trialDays !== undefined ? trialDays : plan.trialDays,
      },
    );

    await prisma.appSubscription.upsert({
      where: { shop },
      create: {
        shop,
        planKey: plan.planKey,
        shopifySubscriptionId: subscriptionId,
        billingInterval: plan.billingInterval ?? "MONTHLY",
        status: APP_SUBSCRIPTION_STATUS.PENDING,
        tokensPerPeriod: plan.tokens,
        confirmationUrl,
      },
      update: {
        planKey: plan.planKey,
        shopifySubscriptionId: subscriptionId,
        billingInterval: plan.billingInterval ?? "MONTHLY",
        status: APP_SUBSCRIPTION_STATUS.PENDING,
        tokensPerPeriod: plan.tokens,
        confirmationUrl,
      },
    });

    return {
      confirmationUrl,
      shopifySubscriptionId: subscriptionId,
    };
  },

  async createOneTimePurchase({ admin, shop, plan, returnUrl }) {
    const name = plan.shopifyPlanName ?? plan.displayName;
    const { confirmationUrl, purchaseId } = await shopifyCreateOneTimePurchase(
      admin,
      {
        planName: name,
        priceAmount: plan.priceAmount,
        currencyCode: plan.currencyCode,
        returnUrl,
      },
    );

    await appendBillingLog({
      shop,
      eventType: BILLING_LOG_EVENT.TOKEN_PACK_INITIATED,
      planKey: plan.planKey,
      referenceId: purchaseId,
      metadata: { confirmationUrl },
    });

    return {
      confirmationUrl,
      shopifyPurchaseId: purchaseId,
    };
  },
};
