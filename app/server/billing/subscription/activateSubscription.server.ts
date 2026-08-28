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

  const isPlanChangeFromPending =
    existing?.pendingShopifySubscriptionId === shopifySubscriptionId;

  const wasPending =
    existing?.status === APP_SUBSCRIPTION_STATUS.PENDING ||
    !existing ||
    existing.shopifySubscriptionId !== shopifySubscriptionId ||
    isPlanChangeFromPending;

  /** 首次开通（含首次 PENDING→ACTIVE）；换套餐走 changed 邮件，不发 started / 运营飞书 */
  const isFirstActivation =
    !existing || existing.status === APP_SUBSCRIPTION_STATUS.PENDING;

  console.info(
    `${LOG} activation-context shop=${shop} existingStatus=${existing?.status ?? "(none)"} existingPlanKey=${existing?.planKey ?? "(none)"} wasPending=${wasPending} isFirstActivation=${isFirstActivation} isPlanChangeFromPending=${isPlanChangeFromPending}`,
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
      currentPeriodStart: period.currentPeriodStart,
      currentPeriodEnd: period.currentPeriodEnd,
      usageLineItemId: overage?.usageLineItemId ?? null,
      overagePricePerThousand: overage?.overagePricePerThousand ?? null,
      cappedAmount: overage?.cappedAmount ?? null,
      cappedCurrency: overage?.cappedCurrency ?? null,
      usageBalanceUsed: overage?.usageBalanceUsed ?? "0",
      overageEnabled: overage?.overageEnabled ?? Boolean(overage?.usageLineItemId),
      overageSpendLimit: overage?.cappedAmount ?? null,
      overagePendingTokens: 0,
      pendingShopifySubscriptionId: null,
      pendingPlanKey: null,
      pendingConfirmationUrl: null,
      pendingCreatedAt: null,
      rawPayload: rawPayload as Prisma.InputJsonValue,
    },
    update: {
      planKey,
      shopifySubscriptionId,
      billingInterval,
      status: APP_SUBSCRIPTION_STATUS.ACTIVE,
      tokensPerPeriod,
      currentPeriodStart: period.currentPeriodStart,
      currentPeriodEnd: period.currentPeriodEnd,
      cancelledAt: null,
      pendingShopifySubscriptionId: null,
      pendingPlanKey: null,
      pendingConfirmationUrl: null,
      pendingCreatedAt: null,
      ...(overage
        ? {
            usageLineItemId: overage.usageLineItemId ?? null,
            overagePricePerThousand: overage.overagePricePerThousand ?? null,
            cappedAmount: overage.cappedAmount ?? null,
            cappedCurrency: overage.cappedCurrency ?? null,
            usageBalanceUsed: overage.usageBalanceUsed ?? "0",
            overageEnabled:
              overage.overageEnabled ?? Boolean(overage.usageLineItemId),
            overageSpendLimit: overage.cappedAmount ?? null,
            overageSpendingEnabled: true,
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

  // 更新后可用积分 = purchasedTokens + 新 subscriptionTokens
  const creditsAfter = account.purchasedTokens + tokensPerPeriod;

  if (isFirstActivation) {
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
  } else if (wasPending) {
    await appendBillingLog({
      shop,
      eventType: BILLING_LOG_EVENT.SUBSCRIPTION_ACTIVATED,
      planKey,
      referenceId: shopifySubscriptionId,
      tokensDelta: tokensPerPeriod,
      metadata: {
        billingInterval,
        changeType: "plan_change",
        previousPlanKey: existing?.planKey ?? null,
      },
    });
    console.info(
      `${LOG} notify-feishu-skip shop=${shop} reason=plan-change (only first activation sends ops feishu)`,
    );
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
  if (isFirstActivation) {
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
  } else if (
    (isPlanChangeFromPending || wasPending) &&
    previousPlanKey &&
    previousPlanKey !== planKey
  ) {
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

/**
 * 仅匹配当前主行 `shopifySubscriptionId`。
 * 不按 shop 回落：换套餐后旧 GID 的 cancel webhook 必须 no-op，避免误删新 ACTIVE。
 */
async function findActiveMainSubscriptionForCancel(params: {
  shop: string;
  shopifySubscriptionId: string;
}) {
  return prisma.appSubscription.findFirst({
    where: {
      shop: params.shop,
      shopifySubscriptionId: params.shopifySubscriptionId,
    },
  });
}

export async function markSubscriptionNonActive(params: {
  shop: string;
  shopifySubscriptionId: string;
  status: string;
  rawPayload?: Record<string, unknown>;
}): Promise<void> {
  const sub = await findActiveMainSubscriptionForCancel({
    shop: params.shop,
    shopifySubscriptionId: params.shopifySubscriptionId,
  });
  if (!sub) {
    console.info(
      `${LOG} mark-non-active-skip shop=${params.shop} reason=no-matching-main-id subscriptionId=${params.shopifySubscriptionId}`,
    );
    return;
  }

  // 换套餐 pending 期间：勿因旧主行 CANCELLED 误删仍有效的本地 ACTIVE
  if (sub.pendingShopifySubscriptionId) {
    console.info(
      `${LOG} mark-non-active-skip shop=${params.shop} reason=pending-plan-change subscriptionId=${params.shopifySubscriptionId}`,
    );
    return;
  }

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
