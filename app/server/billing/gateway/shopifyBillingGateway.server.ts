import prisma from "../../../db.server";
import { appendBillingLog } from "../billingLog.server";
import { BILLING_LOG_EVENT } from "../types.server";
import type { BillingGateway } from "./billingGateway.types";
import {
  shopifyCreateOneTimePurchase,
  shopifyCreateSubscription,
  shopifyCreateUsageRecord,
  shopifyUpdateUsageCappedAmount,
} from "./shopifyGraphqlBilling.server";
import { APP_SUBSCRIPTION_STATUS } from "../types.server";

function overageFromPlan(plan: {
  overagePricePerThousand: string | null;
  defaultOverageCapAmount: string | null;
  overageTerms: string | null;
  currencyCode: string;
}) {
  if (!plan.defaultOverageCapAmount || !plan.overagePricePerThousand) {
    return null;
  }
  return {
    terms:
      plan.overageTerms ??
      `Overage tokens beyond plan allowance at $${plan.overagePricePerThousand} per 1,000 tokens.`,
    cappedAmount: plan.defaultOverageCapAmount,
    currencyCode: plan.currencyCode || "USD",
    pricePerThousand: plan.overagePricePerThousand,
  };
}

export const shopifyBillingGateway: BillingGateway = {
  async createSubscription({ admin, shop, plan, returnUrl, trialDays }) {
    const name = plan.shopifyPlanName ?? plan.displayName;
    const overage = overageFromPlan(plan);
    const { confirmationUrl, subscriptionId, usageLineItem } =
      await shopifyCreateSubscription(admin, {
        planName: name,
        priceAmount: plan.priceAmount,
        currencyCode: plan.currencyCode,
        billingInterval: plan.billingInterval,
        returnUrl,
        trialDays: trialDays !== undefined ? trialDays : plan.trialDays,
        overage: overage
          ? {
              terms: overage.terms,
              cappedAmount: overage.cappedAmount,
              currencyCode: overage.currencyCode,
            }
          : null,
      });

    const usageFields = {
      usageLineItemId: usageLineItem?.id ?? null,
      overagePricePerThousand: overage?.pricePerThousand ?? null,
      cappedAmount: usageLineItem?.cappedAmount ?? overage?.cappedAmount ?? null,
      cappedCurrency:
        usageLineItem?.cappedCurrency ?? overage?.currencyCode ?? null,
      usageBalanceUsed: usageLineItem?.balanceUsed ?? "0",
      overageEnabled: Boolean(usageLineItem?.id || overage),
      overagePendingTokens: 0,
    };

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
        ...usageFields,
      },
      update: {
        planKey: plan.planKey,
        shopifySubscriptionId: subscriptionId,
        billingInterval: plan.billingInterval ?? "MONTHLY",
        status: APP_SUBSCRIPTION_STATUS.PENDING,
        tokensPerPeriod: plan.tokens,
        confirmationUrl,
        ...usageFields,
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

  async createUsageRecord({
    admin,
    subscriptionLineItemId,
    description,
    amount,
    currencyCode,
    idempotencyKey,
  }) {
    const { usageRecordId } = await shopifyCreateUsageRecord(admin, {
      subscriptionLineItemId,
      description,
      amount,
      currencyCode,
      idempotencyKey,
    });
    return { usageRecordId };
  },

  async updateOverageCap({
    admin,
    usageLineItemId,
    cappedAmount,
    currencyCode,
  }) {
    return shopifyUpdateUsageCappedAmount(admin, {
      usageLineItemId,
      cappedAmount,
      currencyCode,
    });
  },
};
