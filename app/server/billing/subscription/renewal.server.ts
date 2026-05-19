import type { Account, AppSubscription } from "../../../generated/prisma";
import prisma from "../../../db.server";
import { appendBillingLog } from "../billingLog.server";
import { BILLING_LOG_EVENT } from "../types.server";

export type SubscriptionPeriodSnapshot = {
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  tokensPerPeriod: number;
  planKey: string;
};

/**
 * 续费：归档上一周期用量 → 写 Log → 更新订阅周期 → 重置 Account 订阅池与 usedTokens。
 */
export async function archivePeriodAndRenew(params: {
  shop: string;
  appName: string;
  subscription: AppSubscription;
  account: Account;
  next: SubscriptionPeriodSnapshot;
}): Promise<void> {
  const { shop, appName, subscription, account, next } = params;

  const periodStart = subscription.currentPeriodStart;
  const periodEnd = subscription.currentPeriodEnd;

  if (periodStart && periodEnd) {
    await prisma.accountPeriodUsage.upsert({
      where: {
        appSubscriptionId_periodStart_periodEnd: {
          appSubscriptionId: subscription.id,
          periodStart,
          periodEnd,
        },
      },
      create: {
        shop,
        appName,
        appSubscriptionId: subscription.id,
        planKey: subscription.planKey,
        periodStart,
        periodEnd,
        usedTokens: account.usedTokens,
        subscriptionTokensAllocated: subscription.tokensPerPeriod,
        purchasedTokensRemaining: account.purchasedTokens,
        trialTokensRemaining: account.trialTokens,
      },
      update: {},
    });
  }

  await appendBillingLog({
    shop,
    appName,
    eventType: BILLING_LOG_EVENT.SUBSCRIPTION_RENEWED,
    planKey: subscription.planKey,
    referenceId: subscription.shopifySubscriptionId,
    usedTokens: account.usedTokens,
    metadata: {
      previousPeriodEnd: periodEnd?.toISOString() ?? null,
      nextPeriodEnd: next.currentPeriodEnd?.toISOString() ?? null,
    },
  });

  await prisma.appSubscription.update({
    where: { id: subscription.id },
    data: {
      planKey: next.planKey,
      tokensPerPeriod: next.tokensPerPeriod,
      currentPeriodStart: next.currentPeriodStart,
      currentPeriodEnd: next.currentPeriodEnd,
      status: "ACTIVE",
    },
  });

  await prisma.account.update({
    where: { shop_appName: { shop, appName } },
    data: {
      usedTokens: 0,
      subscriptionTokens: next.tokensPerPeriod,
    },
  });
}

export function isSubscriptionRenewal(
  previous: AppSubscription | null,
  nextPeriodEnd: Date | null,
): boolean {
  if (!previous?.currentPeriodEnd || !nextPeriodEnd) return false;
  if (previous.status !== "ACTIVE") return false;
  return nextPeriodEnd.getTime() > previous.currentPeriodEnd.getTime();
}
