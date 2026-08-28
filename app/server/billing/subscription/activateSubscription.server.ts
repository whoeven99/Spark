import type { Prisma } from "../../../generated/prisma";
import prisma from "../../../db.server";
import { appendBillingLog } from "../billingLog.server";
import { ensureAccount } from "../account/ensureAccount.server";
import {
  archivePeriodAndRenew,
  isSubscriptionRenewal,
  type SubscriptionPeriodSnapshot,
} from "./renewal.server";
import { sendSubscriptionFeishuNotify } from "../../feishu/scenarios/sendSubscriptionFeishuNotify.server";
import { notifySubscriptionEmail } from "../../notifications/notifyMerchant.server";
import { buildCreditAccountChange } from "../../notifications/buildNotificationVariables.server";
import { getAvailableTokens } from "../../tokenUsage/accountBalance.server";
import { getPlanByKey } from "../plans/planCatalog.server";
import {
  APP_SUBSCRIPTION_STATUS,
  BILLING_LOG_EVENT,
} from "../types.server";
const LOG = "[Billing][SubscriptionApply]";

export async function applyActiveSubscription(params: {
  shop: string;
  shopifySubscriptionId: string;
  planKey: string;
  billingInterval: string;
  tokensPerPeriod: number;
  trialEndsAt?: Date | null;
  period: SubscriptionPeriodSnapshot;
  overage?: {
    usageLineItemId?: string | null;
    overagePricePerThousand?: string | null;
    cappedAmount?: string | null;
    cappedCurrency?: string | null;
    usageBalanceUsed?: string | null;
    overageEnabled?: boolean;
  };
  rawPayload?: Record<string, unknown>;
}): Promise<void> {
  const {
    shop,
    shopifySubscriptionId,
    planKey,
    billingInterval,
    tokensPerPeriod,
    trialEndsAt,
    period,
    overage,
    rawPayload,
  } = params;

  console.info(
    `${LOG} enter shop=${shop} planKey=${planKey} subscriptionId=${shopifySubscriptionId} tokensPerPeriod=${tokensPerPeriod}`,
  );

  await ensureAccount(shop);

  const existing = await prisma.appSubscription.findUnique({
    where: { shop },
  });

  const account = await prisma.account.findUniqueOrThrow({
    where: { shop },
  });

  const nextPeriodEnd = period.currentPeriodEnd ?? null;

  if (
    existing &&
    existing.shopifySubscriptionId === shopifySubscriptionId &&
    isSubscriptionRenewal(existing, nextPeriodEnd)
  ) {
    console.info(
      `${LOG} renewal-only shop=${shop} subscriptionId=${shopifySubscriptionId} (skip feishu + merchant email)`,
    );
    await archivePeriodAndRenew({
      shop,
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

  console.info(
    `${LOG} activation-context shop=${shop} existingStatus=${existing?.status ?? "(none)"} existingPlanKey=${existing?.planKey ?? "(none)"} wasPending=${wasPending}`,
  );

  await prisma.appSubscription.upsert({
    where: { shop },
    create: {
      shop,
      planKey,
      shopifySubscriptionId,
      billingInterval,
      status: APP_SUBSCRIPTION_STATUS.ACTIVE,
      tokensPerPeriod,
      trialEndsAt: trialEndsAt ?? null,
      currentPeriodStart: period.currentPeriodStart,
      currentPeriodEnd: period.currentPeriodEnd,
      usageLineItemId: overage?.usageLineItemId ?? null,
      overagePricePerThousand: overage?.overagePricePerThousand ?? null,
      cappedAmount: overage?.cappedAmount ?? null,
      cappedCurrency: overage?.cappedCurrency ?? null,
      usageBalanceUsed: overage?.usageBalanceUsed ?? "0",
      overageEnabled: overage?.overageEnabled ?? Boolean(overage?.usageLineItemId),
      overagePendingTokens: 0,
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
      ...(overage
        ? {
            usageLineItemId: overage.usageLineItemId ?? null,
            overagePricePerThousand: overage.overagePricePerThousand ?? null,
            cappedAmount: overage.cappedAmount ?? null,
            cappedCurrency: overage.cappedCurrency ?? null,
            usageBalanceUsed: overage.usageBalanceUsed ?? "0",
            overageEnabled:
              overage.overageEnabled ?? Boolean(overage.usageLineItemId),
          }
        : {}),
      rawPayload: rawPayload as Prisma.InputJsonValue,
    },
  });

  const creditsBefore = getAvailableTokens(account);

  // 开通 / 升级 / 换套餐：保留 usedTokens；仅周期续费（renewal.server）清零。
  await prisma.account.update({
    where: { shop },
    data: {
      subscriptionTokens: tokensPerPeriod,
    },
  });

  // 更新后可用积分 = purchasedTokens + trialTokens + 新 subscriptionTokens
  const creditsAfter =
    account.purchasedTokens + account.trialTokens + tokensPerPeriod;

  if (wasPending) {
    await appendBillingLog({
      shop,
      eventType: BILLING_LOG_EVENT.SUBSCRIPTION_ACTIVATED,
      planKey,
      referenceId: shopifySubscriptionId,
      tokensDelta: tokensPerPeriod,
      metadata: { billingInterval },
    });

    console.info(`${LOG} notify-feishu-start shop=${shop} planKey=${planKey}`);
    try {
      const feishuResult = await sendSubscriptionFeishuNotify({
        shop,
        planKey,
      });
      console.info(
        `${LOG} notify-feishu-done shop=${shop} ok=${feishuResult.ok} skipped=${"skipped" in feishuResult ? feishuResult.skipped : false} reason=${"reason" in feishuResult ? feishuResult.reason : "sent"}`,
      );
    } catch (error) {
      console.error(`${LOG} notify-feishu-failed shop=${shop}:`, error);
    }
  } else {
    console.info(
      `${LOG} notify-feishu-skip shop=${shop} reason=not-was-pending (only first activation sends ops feishu)`,
    );
  }

  // 邮件：首次开通（started）或换套餐（changed）；周期续费走 renewal.server 已提前 return，不在此发送
  const previousPlanKey = existing?.planKey;
  const currentPlan = await getPlanByKey(planKey).catch(() => null);
  const currentPlanName = currentPlan?.displayName ?? planKey;
  const appName = "spark";
  if (wasPending) {
    console.info(`${LOG} notify-email-start shop=${shop} event=subscriptionStarted`);
    await notifySubscriptionEmail({
      shop,
      appName,
      event: "subscriptionStarted",
      currentPlanName,
      billingInterval,
      occurredAt: new Date(),
      creditAccountChange: buildCreditAccountChange({
        creditsBefore,
        creditsAfter,
        creditReasonKey: "subscription_started",
      }),
    });
  } else if (previousPlanKey && previousPlanKey !== planKey) {
    console.info(
      `${LOG} notify-email-start shop=${shop} event=subscriptionChanged previousPlanKey=${previousPlanKey}`,
    );
    const previousPlan = await getPlanByKey(previousPlanKey).catch(() => null);
    await notifySubscriptionEmail({
      shop,
      appName,
      event: "subscriptionChanged",
      currentPlanName,
      previousPlanName: previousPlan?.displayName ?? previousPlanKey,
      billingInterval,
      occurredAt: new Date(),
      creditAccountChange: buildCreditAccountChange({
        creditsBefore,
        creditsAfter,
        creditReasonKey: "subscription_changed",
      }),
    });
  } else {
    console.info(
      `${LOG} notify-email-skip shop=${shop} reason=not-started-nor-plan-change wasPending=${wasPending} previousPlanKey=${previousPlanKey ?? "(none)"} planKey=${planKey}`,
    );
  }

  console.info(`${LOG} done shop=${shop} subscriptionId=${shopifySubscriptionId}`);
}

/**
 * 取消付费订阅：从 `subscriptionTokens` 扣减该套餐周期额度（通常归零）。
 */
export function subscriptionTokensAfterCancel(
  currentSubscriptionTokens: number,
  subscriptionTokensToRemove: number,
): {
  nextSubscriptionTokens: number;
  removedTokens: number;
  tokensDelta: number;
} {
  const removedTokens = Math.min(
    Math.max(0, currentSubscriptionTokens),
    Math.max(0, subscriptionTokensToRemove),
  );
  const nextSubscriptionTokens = Math.max(
    0,
    currentSubscriptionTokens - removedTokens,
  );
  return {
    nextSubscriptionTokens,
    removedTokens,
    tokensDelta: nextSubscriptionTokens - currentSubscriptionTokens,
  };
}

async function findAppSubscriptionForWebhook(params: {
  shop: string;
  shopifySubscriptionId: string;
}) {
  const byShopifyId = await prisma.appSubscription.findFirst({
    where: {
      shop: params.shop,
      shopifySubscriptionId: params.shopifySubscriptionId,
    },
  });
  if (byShopifyId) return byShopifyId;

  return prisma.appSubscription.findUnique({
    where: { shop: params.shop },
  });
}

export async function markSubscriptionNonActive(params: {
  shop: string;
  shopifySubscriptionId: string;
  status: string;
  rawPayload?: Record<string, unknown>;
}): Promise<void> {
  const sub = await findAppSubscriptionForWebhook({
    shop: params.shop,
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

  let cancelCreditsBefore = 0;
  let cancelCreditsAfter = 0;

  await prisma.$transaction(async (tx) => {
    const account = await tx.account.findUnique({
      where: { shop: params.shop },
    });

    const previousSubscriptionTokens = account?.subscriptionTokens ?? 0;
    const { nextSubscriptionTokens, removedTokens, tokensDelta } =
      subscriptionTokensAfterCancel(
        previousSubscriptionTokens,
        sub.tokensPerPeriod,
      );

    if (account) {
      cancelCreditsBefore = getAvailableTokens(account);
      cancelCreditsAfter = getAvailableTokens({
        ...account,
        subscriptionTokens: nextSubscriptionTokens,
      });
    }

    await tx.billingLog.create({
      data: {
        shop: params.shop,
        eventType: BILLING_LOG_EVENT.SUBSCRIPTION_CANCELLED,
        planKey: sub.planKey,
        referenceId: sub.shopifySubscriptionId,
        tokensDelta,
        metadata: {
          label: "取消订阅",
          status: params.status,
          cancelledPlanKey: sub.planKey,
          subscriptionTokensRemoved: removedTokens,
          tokensPerPeriod: sub.tokensPerPeriod,
          previousSubscriptionTokens,
          nextSubscriptionTokens,
          cancelledAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    if (account) {
      await tx.account.update({
        where: { shop: params.shop },
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

  const cancelledPlan = await getPlanByKey(sub.planKey).catch(() => null);
  await notifySubscriptionEmail({
    shop: params.shop,
    appName: "spark",
    event: "subscriptionCanceled",
    currentPlanName: cancelledPlan?.displayName ?? sub.planKey,
    previousPlanName: cancelledPlan?.displayName ?? sub.planKey,
    occurredAt: new Date(),
    creditAccountChange: buildCreditAccountChange({
      creditsBefore: cancelCreditsBefore,
      creditsAfter: cancelCreditsAfter,
      creditReasonKey: "subscription_canceled",
    }),
  });
}
