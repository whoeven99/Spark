import type { Account, AppSubscription } from "../../../generated/prisma";
import prisma from "../../../db.server";
import {
  canSettlePoolsAtRenewal,
  settlePoolsAtRenewal,
} from "../../tokenUsage/tokenPools.server";
import { appendBillingLog } from "../billingLog.server";
import { BILLING_LOG_EVENT } from "../types.server";

export type SubscriptionPeriodSnapshot = {
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  tokensPerPeriod: number;
  planKey: string;
};

/**
 * 续费：归档上一周期 → 写 Log → 刷新订阅池、清零 `usedTokens`；
 * 按本周期 `usedTokens` 结算一次，`purchasedTokens` / `trialTokens` 写入真实剩余（周期内不改各池）。
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

  const settledPools = canSettlePoolsAtRenewal(account)
    ? settlePoolsAtRenewal(account)
    : {
        subscriptionTokens: account.subscriptionTokens,
        purchasedTokens: account.purchasedTokens,
        trialTokens: account.trialTokens,
      };

  await prisma.account.update({
    where: { shop_appName: { shop, appName } },
    data: {
      usedTokens: 0,
      subscriptionTokens: next.tokensPerPeriod,
      purchasedTokens: settledPools.purchasedTokens,
      trialTokens: settledPools.trialTokens,
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
