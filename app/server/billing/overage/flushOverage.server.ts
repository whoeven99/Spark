import type { Account, AppSubscription } from "../../../generated/prisma";
import prisma from "../../../db.server";
import { getBillingGateway } from "../gateway/getBillingGateway.server";
import type { ShopifyAdminGraphqlClient } from "../../ai/skills/shopifyInfo/shopifyInfo.tool";
import {
  formatMoney,
  overageAmountToTokens,
  remainingCapAmount,
  effectiveOverageCapAmount,
  shouldFlushOverage,
  tokensToOverageAmount,
} from "./overageMath.server";
import { getAvailableTokens } from "../../tokenUsage/accountBalance.server";

const LOG = "[Billing][OverageFlush]";

function effectiveCapOf(sub: AppSubscription | null | undefined): string | null {
  if (!sub) return null;
  return effectiveOverageCapAmount({
    cappedAmount: sub.cappedAmount,
    overageSpendLimit: sub.overageSpendLimit,
  });
}

export function isOverageAvailable(sub: AppSubscription | null | undefined): boolean {
  if (!sub) return false;
  if (!sub.overageEnabled || !sub.usageLineItemId) return false;
  if (sub.overageSpendingEnabled === false) return false;
  if (sub.status !== "ACTIVE") return false;
  return remainingCapAmount({
    cappedAmount: effectiveCapOf(sub),
    usageBalanceUsed: sub.usageBalanceUsed,
  }) > 0;
}

export function computeAccess(params: {
  account: Pick<
    Account,
    "subscriptionTokens" | "purchasedTokens" | "usedTokens"
  >;
  subscription: AppSubscription | null;
}): {
  hasIncludedQuota: boolean;
  overageAvailable: boolean;
  hasAccess: boolean;
  denialReason: "none" | "quota_exhausted" | "overage_cap_reached";
  capRemainingUsd: number;
  estimatedOverageTokensLeft: number;
} {
  const included = getAvailableTokens(params.account);
  const hasIncludedQuota = params.account.usedTokens < included;
  const overageAvailable = isOverageAvailable(params.subscription);
  const capRemainingUsd = remainingCapAmount({
    cappedAmount: effectiveCapOf(params.subscription),
    usageBalanceUsed: params.subscription?.usageBalanceUsed,
  });
  const estimatedOverageTokensLeft = overageAmountToTokens(
    capRemainingUsd,
    params.subscription?.overagePricePerThousand,
  );

  if (hasIncludedQuota) {
    return {
      hasIncludedQuota: true,
      overageAvailable,
      hasAccess: true,
      denialReason: "none",
      capRemainingUsd,
      estimatedOverageTokensLeft,
    };
  }

  if (overageAvailable) {
    return {
      hasIncludedQuota: false,
      overageAvailable: true,
      hasAccess: true,
      denialReason: "none",
      capRemainingUsd,
      estimatedOverageTokensLeft,
    };
  }

  const hadOverage =
    Boolean(params.subscription?.overageEnabled && params.subscription?.usageLineItemId) &&
    params.subscription?.overageSpendingEnabled !== false;

  return {
    hasIncludedQuota: false,
    overageAvailable: false,
    hasAccess: false,
    denialReason: hadOverage ? "overage_cap_reached" : "quota_exhausted",
    capRemainingUsd,
    estimatedOverageTokensLeft,
  };
}

/**
 * After billed token usage: if used exceeds included pools, accumulate pending overage
 * and flush to Shopify when thresholds are met.
 */
export async function trackAndFlushOverage(params: {
  shop: string;
  billedTokens: number;
  admin?: ShopifyAdminGraphqlClient | null;
}): Promise<void> {
  const shop = params.shop.trim();
  if (!shop || params.billedTokens <= 0) return;

  const [account, subscription] = await Promise.all([
    prisma.account.findUnique({ where: { shop } }),
    prisma.appSubscription.findUnique({ where: { shop } }),
  ]);
  if (!account || !subscription) return;
  if (!subscription.overageEnabled || !subscription.usageLineItemId) return;
  if (subscription.overageSpendingEnabled === false) return;

  const included = getAvailableTokens(account);
  const overageTokens = Math.max(0, account.usedTokens - included);
  if (overageTokens <= 0 && subscription.overagePendingTokens <= 0) return;

  // Newly billed portion that fell into overage this call
  const previousUsed = account.usedTokens - params.billedTokens;
  const previousOverage = Math.max(0, previousUsed - included);
  const newlyOverage = Math.max(0, overageTokens - previousOverage);

  if (newlyOverage > 0) {
    await prisma.appSubscription.update({
      where: { shop },
      data: {
        overagePendingTokens: { increment: newlyOverage },
      },
    });
  }

  const refreshed = await prisma.appSubscription.findUniqueOrThrow({
    where: { shop },
  });

  if (
    !shouldFlushOverage({
      pendingTokens: refreshed.overagePendingTokens,
      pricePerThousand: refreshed.overagePricePerThousand,
    })
  ) {
    return;
  }

  await flushOveragePending({
    shop,
    admin: params.admin ?? null,
  });
}

export async function flushOveragePending(params: {
  shop: string;
  admin?: ShopifyAdminGraphqlClient | null;
}): Promise<{ posted: boolean; amount: number }> {
  const shop = params.shop.trim();
  const sub = await prisma.appSubscription.findUnique({ where: { shop } });
  if (!sub?.usageLineItemId || sub.overagePendingTokens <= 0) {
    return { posted: false, amount: 0 };
  }

  const capLeft = remainingCapAmount({
    cappedAmount: effectiveCapOf(sub),
    usageBalanceUsed: sub.usageBalanceUsed,
  });
  if (capLeft <= 0) {
    console.warn(`${LOG} skip shop=${shop} reason=cap-exhausted`);
    return { posted: false, amount: 0 };
  }

  const maxTokensByCap = overageAmountToTokens(
    capLeft,
    sub.overagePricePerThousand,
  );
  const tokensToCharge = Math.min(sub.overagePendingTokens, maxTokensByCap);
  if (tokensToCharge <= 0) {
    return { posted: false, amount: 0 };
  }

  const amount = tokensToOverageAmount(
    tokensToCharge,
    sub.overagePricePerThousand,
  );
  if (amount <= 0) return { posted: false, amount: 0 };

  // Cap charge to remaining balance
  const chargeAmount = Math.min(amount, capLeft);
  const currency = sub.cappedCurrency || "USD";
  const periodKey =
    sub.currentPeriodStart?.toISOString() ??
    sub.updatedAt.toISOString().slice(0, 10);
  const batchIndex = Math.floor(Date.now() / 1000);
  const idempotencyKey = `${shop}:${periodKey}:${tokensToCharge}:${batchIndex}`;

  const gateway = getBillingGateway();
  const needsAdmin =
    Boolean(gateway.createUsageRecord) && process.env.BILLING_GATEWAY !== "noop";
  let admin = params.admin ?? null;
  if (needsAdmin && !admin) {
    try {
      // Dynamic import: shopify.server initializes App Bridge at module load and
      // breaks vitest when only overage math/access helpers are under test.
      const { unauthenticated } = await import("../../../shopify.server");
      const auth = await unauthenticated.admin(shop);
      admin = auth.admin as ShopifyAdminGraphqlClient;
    } catch (error) {
      console.warn(`${LOG} defer shop=${shop} reason=no-admin-client`, error);
      return { posted: false, amount: 0 };
    }
  }

  const charge = await prisma.overageUsageCharge.create({
    data: {
      shop,
      appSubscriptionId: sub.id,
      idempotencyKey,
      tokens: tokensToCharge,
      amount: formatMoney(chargeAmount),
      currency,
      status: "PENDING",
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
    },
  });

  try {
    let usageRecordId: string | null = null;

    if (gateway.createUsageRecord) {
      const result = await gateway.createUsageRecord({
        admin: admin as ShopifyAdminGraphqlClient,
        shop,
        subscriptionLineItemId: sub.usageLineItemId,
        description: `Spark overage: ${tokensToCharge.toLocaleString()} tokens`,
        amount: chargeAmount,
        currencyCode: currency,
        idempotencyKey,
      });
      usageRecordId = result.usageRecordId;
    }

    const nextBalance = formatMoney(
      parseFloat(sub.usageBalanceUsed ?? "0") + chargeAmount,
    );

    await prisma.$transaction([
      prisma.overageUsageCharge.update({
        where: { id: charge.id },
        data: {
          status: "POSTED",
          shopifyUsageRecordId: usageRecordId,
        },
      }),
      prisma.appSubscription.update({
        where: { shop },
        data: {
          overagePendingTokens: Math.max(
            0,
            sub.overagePendingTokens - tokensToCharge,
          ),
          usageBalanceUsed: nextBalance,
        },
      }),
    ]);

    console.info(
      `${LOG} posted shop=${shop} tokens=${tokensToCharge} amount=${chargeAmount}`,
    );
    return { posted: true, amount: chargeAmount };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.overageUsageCharge.update({
      where: { id: charge.id },
      data: { status: "FAILED", errorMessage: message.slice(0, 500) },
    });
    console.error(`${LOG} failed shop=${shop}:`, error);
    throw error;
  }
}
