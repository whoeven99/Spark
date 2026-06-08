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

export async function handleAppSubscriptionWebhook(params: {
  shop: string;
  payload: unknown;
  admin?: ShopifyAdminGraphqlClient;
}): Promise<void> {
  const webhookSub = parseWebhookSubscription(params.payload);
  if (!webhookSub?.admin_graphql_api_id) {
    console.warn("[Billing] subscription webhook missing id", params.payload);
    return;
  }

  const shopifySubscriptionId = webhookSub.admin_graphql_api_id;
  const mappedStatus = mapShopifySubscriptionStatus(
    webhookSub.status ?? "UNKNOWN",
  );

  let planKey =
    (
      await prisma.appSubscription.findUnique({
        where: { shop: params.shop },
      })
    )?.planKey ?? null;

  let billingInterval = "MONTHLY";
  let tokensPerPeriod = 0;
  let periodStart: Date | null = null;
  let periodEnd: Date | null = null;
  let trialEndsAt: Date | null = null;

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
    }
  }

  if (!planKey) {
    const pending = await prisma.appSubscription.findFirst({
      where: { shopifySubscriptionId },
    });
    planKey = pending?.planKey ?? null;
    if (pending) {
      billingInterval = pending.billingInterval;
      tokensPerPeriod = pending.tokensPerPeriod;
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

  if (mappedStatus === APP_SUBSCRIPTION_STATUS.ACTIVE) {
    if (!planKey) {
      console.warn(
        "[Billing] ACTIVE subscription but unknown planKey",
        shopifySubscriptionId,
      );
      return;
    }

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
      rawPayload,
    });
    return;
  }

  if (
    mappedStatus === APP_SUBSCRIPTION_STATUS.CANCELLED ||
    mappedStatus === APP_SUBSCRIPTION_STATUS.EXPIRED ||
    mappedStatus === APP_SUBSCRIPTION_STATUS.FROZEN
  ) {
    await markSubscriptionNonActive({
      shop: params.shop,
      shopifySubscriptionId,
      status: mappedStatus,
      rawPayload,
    });
  } else if (mappedStatus === APP_SUBSCRIPTION_STATUS.PENDING) {
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
