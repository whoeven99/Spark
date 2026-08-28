import type { ShopifyAdminGraphqlClient } from "../../ai/skills/shopifyInfo/shopifyInfo.tool";
import {
  mapShopifySubscriptionStatus,
  periodStartFromCreatedAt,
  shopifyFetchAppSubscription,
} from "../gateway/shopifyGraphqlBilling.server";
import { getPlanByKey } from "../plans/planCatalog.server";
import {
  applyActiveSubscription,
  markSubscriptionNonActive,
} from "./activateSubscription.server";
import { handleDeclinedSubscriptionCheckout } from "./pendingPlanChange.server";
import { APP_SUBSCRIPTION_STATUS } from "../types.server";
import prisma from "../../../db.server";

type WebhookAppSubscription = {
  admin_graphql_api_id?: string;
  status?: string;
  name?: string;
};

function parseWebhookSubscription(
  payload: unknown,
): WebhookAppSubscription | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const sub =
    root.app_subscription ??
    root["appSubscription"] ??
    root.subscription;
  if (!sub || typeof sub !== "object") return null;
  return sub as WebhookAppSubscription;
}

const LOG = "[Billing][SubscriptionWebhook]";

export async function handleAppSubscriptionWebhook(params: {
  shop: string;
  payload: unknown;
  admin?: ShopifyAdminGraphqlClient;
}): Promise<void> {
  console.info(`${LOG} enter shop=${params.shop} hasAdmin=${Boolean(params.admin)}`);

  const webhookSub = parseWebhookSubscription(params.payload);
  if (!webhookSub?.admin_graphql_api_id) {
    console.warn(`${LOG} skip reason=missing-subscription-id`, params.payload);
    return;
  }

  const shopifySubscriptionId = webhookSub.admin_graphql_api_id;
  const mappedStatus = mapShopifySubscriptionStatus(
    webhookSub.status ?? "UNKNOWN",
  );
  console.info(
    `${LOG} parsed shop=${params.shop} subscriptionId=${shopifySubscriptionId} webhookStatus=${webhookSub.status ?? "(empty)"} mappedStatus=${mappedStatus}`,
  );

  const existingSub = await prisma.appSubscription.findUnique({
    where: { shop: params.shop },
  });

  const isPendingPlanChange =
    existingSub?.pendingShopifySubscriptionId === shopifySubscriptionId;

  let planKey = isPendingPlanChange
    ? (existingSub?.pendingPlanKey ?? null)
    : (existingSub?.planKey ?? null);

  let billingInterval = existingSub?.billingInterval ?? "MONTHLY";
  let tokensPerPeriod = existingSub?.tokensPerPeriod ?? 0;
  let periodStart: Date | null = null;
  let periodEnd: Date | null = null;
  let trialEndsAt: Date | null = null;
  let fetchedUsageLineItem: {
    id: string;
    cappedAmount: string | null;
    cappedCurrency: string | null;
    balanceUsed: string | null;
  } | null = null;

  if (params.admin) {
    const node = await shopifyFetchAppSubscription(
      params.admin,
      shopifySubscriptionId,
    );
    if (node) {
      periodStart = periodStartFromCreatedAt(node.createdAt);
      periodEnd = node.currentPeriodEnd
        ? new Date(node.currentPeriodEnd)
        : null;
      if (node.trialDays > 0) {
        trialEndsAt = new Date(periodStart);
        trialEndsAt.setUTCDate(trialEndsAt.getUTCDate() + node.trialDays);
      }
      if (node.usageLineItem) {
        fetchedUsageLineItem = node.usageLineItem;
      }
    }
  }

  if (!planKey) {
    const byId = await prisma.appSubscription.findFirst({
      where: { shopifySubscriptionId },
    });
    planKey = byId?.planKey ?? null;
    if (byId) {
      billingInterval = byId.billingInterval;
      tokensPerPeriod = byId.tokensPerPeriod;
    }
  }

  if (planKey) {
    const plan = await getPlanByKey(planKey);
    tokensPerPeriod = plan.tokens;
    billingInterval = plan.billingInterval ?? billingInterval;
  }

  const rawPayload =
    params.payload && typeof params.payload === "object"
      ? (params.payload as Record<string, unknown>)
      : undefined;

  console.info(
    `${LOG} resolved-plan shop=${params.shop} planKey=${planKey ?? "(none)"} tokensPerPeriod=${tokensPerPeriod} billingInterval=${billingInterval} isPendingPlanChange=${isPendingPlanChange}`,
  );

  if (mappedStatus === APP_SUBSCRIPTION_STATUS.DECLINED) {
    console.info(`${LOG} declined shop=${params.shop} subscriptionId=${shopifySubscriptionId}`);
    const result = await handleDeclinedSubscriptionCheckout({
      shop: params.shop,
      shopifySubscriptionId,
    });
    console.info(`${LOG} declined-done shop=${params.shop} result=${result}`);
    return;
  }

  if (mappedStatus === APP_SUBSCRIPTION_STATUS.ACTIVE) {
    if (!planKey) {
      console.warn(
        `${LOG} skip reason=unknown-plan-key shop=${params.shop} subscriptionId=${shopifySubscriptionId}`,
      );
      return;
    }

    console.info(`${LOG} apply-active-subscription shop=${params.shop} planKey=${planKey}`);
    const plan = await getPlanByKey(planKey).catch(() => null);
    const usageFromFetch = fetchedUsageLineItem;
    await applyActiveSubscription({
      shop: params.shop,
      shopifySubscriptionId,
      planKey,
      billingInterval,
      tokensPerPeriod,
      trialEndsAt,
      period: {
        planKey,
        tokensPerPeriod,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      },
      overage: usageFromFetch
        ? {
            usageLineItemId: usageFromFetch.id,
            overagePricePerThousand:
              plan?.overagePricePerThousand ??
              existingSub?.overagePricePerThousand ??
              null,
            cappedAmount: usageFromFetch.cappedAmount,
            cappedCurrency: usageFromFetch.cappedCurrency,
            usageBalanceUsed: usageFromFetch.balanceUsed ?? "0",
            overageEnabled: true,
          }
        : existingSub?.usageLineItemId && !isPendingPlanChange
          ? {
              usageLineItemId: existingSub.usageLineItemId,
              overagePricePerThousand:
                existingSub.overagePricePerThousand ??
                plan?.overagePricePerThousand ??
                null,
              cappedAmount: existingSub.cappedAmount,
              cappedCurrency: existingSub.cappedCurrency,
              usageBalanceUsed: existingSub.usageBalanceUsed ?? "0",
              overageEnabled: true,
            }
          : plan?.defaultOverageCapAmount
            ? {
                overagePricePerThousand: plan.overagePricePerThousand,
                cappedAmount: plan.defaultOverageCapAmount,
                cappedCurrency: plan.currencyCode,
                usageBalanceUsed: "0",
                overageEnabled: false,
              }
            : undefined,
      rawPayload,
    });
    console.info(`${LOG} done-active shop=${params.shop} subscriptionId=${shopifySubscriptionId}`);
    return;
  }

  if (
    mappedStatus === APP_SUBSCRIPTION_STATUS.CANCELLED ||
    mappedStatus === APP_SUBSCRIPTION_STATUS.EXPIRED ||
    mappedStatus === APP_SUBSCRIPTION_STATUS.FROZEN
  ) {
    // pending 槽上的 CANCELLED/EXPIRED：当作拒绝/放弃，清 pending，不走扣额度
    if (isPendingPlanChange) {
      console.info(
        `${LOG} pending-terminal-as-decline shop=${params.shop} status=${mappedStatus}`,
      );
      await handleDeclinedSubscriptionCheckout({
        shop: params.shop,
        shopifySubscriptionId,
      });
      return;
    }

    console.info(`${LOG} mark-non-active shop=${params.shop} status=${mappedStatus}`);
    await markSubscriptionNonActive({
      shop: params.shop,
      shopifySubscriptionId,
      status: mappedStatus,
      rawPayload,
    });
    console.info(`${LOG} done-non-active shop=${params.shop} status=${mappedStatus}`);
  } else if (mappedStatus === APP_SUBSCRIPTION_STATUS.PENDING) {
    // 换套餐 pending 已由 gateway 写入；勿把主行打成 PENDING
    if (isPendingPlanChange) {
      console.info(
        `${LOG} skip-pending-upsert shop=${params.shop} reason=already-in-pending-slot`,
      );
      return;
    }
    // 主行已是 ACTIVE 时，未知 PENDING webhook 不覆盖
    if (existingSub?.status === APP_SUBSCRIPTION_STATUS.ACTIVE) {
      console.info(
        `${LOG} skip-pending-upsert shop=${params.shop} reason=active-main-exists`,
      );
      return;
    }

    console.info(`${LOG} upsert-pending shop=${params.shop} planKey=${planKey ?? "unknown"}`);
    await prisma.appSubscription.upsert({
      where: { shop: params.shop },
      create: {
        shop: params.shop,
        planKey: planKey ?? "unknown",
        shopifySubscriptionId,
        billingInterval,
        status: APP_SUBSCRIPTION_STATUS.PENDING,
        tokensPerPeriod,
      },
      update: {
        shopifySubscriptionId,
        status: APP_SUBSCRIPTION_STATUS.PENDING,
        ...(planKey ? { planKey } : {}),
      },
    });
  }
}
