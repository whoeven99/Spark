import type { Prisma } from "../../../generated/prisma";
import prisma from "../../../db.server";
import { appendBillingLog } from "../billingLog.server";
import { ensureAccount } from "../account/ensureAccount.server";
import { getInternalTrialPlan } from "../plans/planCatalog.server";
import {
  archivePeriodAndRenew,
  isSubscriptionRenewal,
  type SubscriptionPeriodSnapshot,
} from "./renewal.server";
import {
  APP_SUBSCRIPTION_STATUS,
  BILLING_LOG_EVENT,
} from "../types.server";

export async function applyActiveSubscription(params: {
  shop: string;
  appName: string;
  shopifySubscriptionId: string;
  planKey: string;
  billingInterval: string;
  tokensPerPeriod: number;
  trialEndsAt?: Date | null;
  period: SubscriptionPeriodSnapshot;
  rawPayload?: Record<string, unknown>;
}): Promise<void> {
  const {
    shop,
    appName,
    shopifySubscriptionId,
    planKey,
    billingInterval,
    tokensPerPeriod,
    trialEndsAt,
    period,
    rawPayload,
  } = params;

  await ensureAccount(shop, appName);

  const existing = await prisma.appSubscription.findUnique({
    where: { shop_appName: { shop, appName } },
  });

  const account = await prisma.account.findUniqueOrThrow({
    where: { shop_appName: { shop, appName } },
  });

  const nextPeriodEnd = period.currentPeriodEnd ?? null;

  if (
    existing &&
    existing.shopifySubscriptionId === shopifySubscriptionId &&
    isSubscriptionRenewal(existing, nextPeriodEnd)
  ) {
    await archivePeriodAndRenew({
      shop,
      appName,
      subscription: existing,
      account,
      next: {
        ...period,
        planKey,
        tokensPerPeriod,
      },
    });
    return;
  }

  const wasPending =
    existing?.status === APP_SUBSCRIPTION_STATUS.PENDING ||
    !existing ||
    existing.shopifySubscriptionId !== shopifySubscriptionId;

  await prisma.appSubscription.upsert({
    where: { shop_appName: { shop, appName } },
    create: {
      shop,
      appName,
      planKey,
      shopifySubscriptionId,
      billingInterval,
      status: APP_SUBSCRIPTION_STATUS.ACTIVE,
      tokensPerPeriod,
      trialEndsAt: trialEndsAt ?? null,
      currentPeriodStart: period.currentPeriodStart,
      currentPeriodEnd: period.currentPeriodEnd,
      rawPayload: rawPayload as Prisma.InputJsonValue,
    },
    update: {
      planKey,
      shopifySubscriptionId,
      billingInterval,
      status: APP_SUBSCRIPTION_STATUS.ACTIVE,
      tokensPerPeriod,
      trialEndsAt: trialEndsAt ?? null,
      currentPeriodStart: period.currentPeriodStart,
      currentPeriodEnd: period.currentPeriodEnd,
      cancelledAt: null,
      rawPayload: rawPayload as Prisma.InputJsonValue,
    },
  });

  // 开通 / 升级 / 换套餐：保留 usedTokens；仅周期续费（renewal.server）清零。
  await prisma.account.update({
    where: { shop_appName: { shop, appName } },
    data: {
      subscriptionTokens: tokensPerPeriod,
    },
  });

  if (wasPending) {
    await appendBillingLog({
      shop,
      appName,
      eventType: BILLING_LOG_EVENT.SUBSCRIPTION_ACTIVATED,
      planKey,
      referenceId: shopifySubscriptionId,
      tokensDelta: tokensPerPeriod,
      metadata: { billingInterval },
    });
  }
}

/**
 * 取消付费订阅后：`subscriptionTokens` 恢复为产品试用套餐额度（PlanCatalog INTERNAL_TRIAL）。
 */
export function subscriptionTokensAfterCancelToTrial(
  currentSubscriptionTokens: number,
  trialTokensQuota: number,
): {
  nextSubscriptionTokens: number;
  tokensDelta: number;
} {
  const nextSubscriptionTokens = Math.max(0, trialTokensQuota);
  return {
    nextSubscriptionTokens,
    tokensDelta: nextSubscriptionTokens - currentSubscriptionTokens,
  };
}

async function findAppSubscriptionForWebhook(params: {
  shop: string;
  appName: string;
  shopifySubscriptionId: string;
}) {
  const byShopifyId = await prisma.appSubscription.findFirst({
    where: {
      shop: params.shop,
      appName: params.appName,
      shopifySubscriptionId: params.shopifySubscriptionId,
    },
  });
  if (byShopifyId) return byShopifyId;

  return prisma.appSubscription.findUnique({
    where: { shop_appName: { shop: params.shop, appName: params.appName } },
  });
}

export async function markSubscriptionNonActive(params: {
  shop: string;
  appName: string;
  shopifySubscriptionId: string;
  status: string;
  rawPayload?: Record<string, unknown>;
}): Promise<void> {
  const sub = await findAppSubscriptionForWebhook({
    shop: params.shop,
    appName: params.appName,
    shopifySubscriptionId: params.shopifySubscriptionId,
  });
  if (!sub) return;

  const isTerminalCancel =
    params.status === APP_SUBSCRIPTION_STATUS.CANCELLED ||
    params.status === APP_SUBSCRIPTION_STATUS.EXPIRED;

  if (!isTerminalCancel) {
    await prisma.appSubscription.update({
      where: { id: sub.id },
      data: {
        status: params.status,
        rawPayload: params.rawPayload as Prisma.InputJsonValue,
      },
    });
    return;
  }

  const trialPlan = await getInternalTrialPlan(params.appName);
  const trialTokensQuota = trialPlan?.tokens ?? 0;

  await prisma.$transaction(async (tx) => {
    const account = await tx.account.findUnique({
      where: { shop_appName: { shop: params.shop, appName: params.appName } },
    });

    const previousSubscriptionTokens = account?.subscriptionTokens ?? 0;
    const { nextSubscriptionTokens, tokensDelta } =
      subscriptionTokensAfterCancelToTrial(
        previousSubscriptionTokens,
        trialTokensQuota,
      );

    await tx.billingLog.create({
      data: {
        shop: params.shop,
        appName: params.appName,
        eventType: BILLING_LOG_EVENT.SUBSCRIPTION_CANCELLED,
        planKey: trialPlan?.planKey ?? sub.planKey,
        referenceId: sub.shopifySubscriptionId,
        tokensDelta,
        metadata: {
          label: "取消订阅",
          status: params.status,
          cancelledPlanKey: sub.planKey,
          trialTokensQuota,
          previousSubscriptionTokens,
          nextSubscriptionTokens,
          cancelledAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    if (account) {
      await tx.account.update({
        where: { shop_appName: { shop: params.shop, appName: params.appName } },
        data: { subscriptionTokens: nextSubscriptionTokens },
      });
    }

    await tx.accountPeriodUsage.deleteMany({
      where: { appSubscriptionId: sub.id },
    });

    await tx.appSubscription.delete({
      where: { id: sub.id },
    });
  });
}
