import type { ShopifyAdminGraphqlClient } from "../../ai/skills/shopifyInfo/tool";
import {
  mapShopifySubscriptionStatus,
  periodStartFromCreatedAt,
  shopifyFetchAppSubscription,
} from "../gateway/shopifyGraphqlBilling.server";
import { getPlanByKey } from "../plans/planCatalog.server";
import { getAppEntry } from "../../../config/appEntry.server";
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

const LOG = "[Billing][SubscriptionWebhook]";

export async function handleAppSubscriptionWebhook(params: {
  shop: string;
  payload: unknown;
  admin?: ShopifyAdminGraphqlClient;
  appName?: string;
}): Promise<void> {
  const appName = params.appName ?? getAppEntry();
  console.info(`${LOG} enter shop=${params.shop} appName=${appName} hasAdmin=${Boolean(params.admin)}`);

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

  let planKey =
    (
      await prisma.appSubscription.findUnique({
        where: { shop_appName: { shop: params.shop, appName } },
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

  console.info(
    `${LOG} resolved-plan shop=${params.shop} planKey=${planKey ?? "(none)"} tokensPerPeriod=${tokensPerPeriod} billingInterval=${billingInterval}`,
  );

  if (mappedStatus === APP_SUBSCRIPTION_STATUS.ACTIVE) {
    if (!planKey) {
      console.warn(
        `${LOG} skip reason=unknown-plan-key shop=${params.shop} subscriptionId=${shopifySubscriptionId}`,
      );
      return;
    }

    console.info(`${LOG} apply-active-subscription shop=${params.shop} planKey=${planKey}`);
    await applyActiveSubscription({
      shop: params.shop,
      appName,
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
    console.info(`${LOG} done-active shop=${params.shop} subscriptionId=${shopifySubscriptionId}`);
    return;
  }

  if (
    mappedStatus === APP_SUBSCRIPTION_STATUS.CANCELLED ||
    mappedStatus === APP_SUBSCRIPTION_STATUS.EXPIRED ||
    mappedStatus === APP_SUBSCRIPTION_STATUS.FROZEN
  ) {
    console.info(`${LOG} mark-non-active shop=${params.shop} status=${mappedStatus}`);
    await markSubscriptionNonActive({
      shop: params.shop,
      appName,
      shopifySubscriptionId,
      status: mappedStatus,
      rawPayload,
    });
    console.info(`${LOG} done-non-active shop=${params.shop} status=${mappedStatus}`);
  } else if (mappedStatus === APP_SUBSCRIPTION_STATUS.PENDING) {
    console.info(`${LOG} upsert-pending shop=${params.shop} planKey=${planKey ?? "unknown"}`);
    await prisma.appSubscription.upsert({
      where: { shop_appName: { shop: params.shop, appName } },
      create: {
        shop: params.shop,
        appName,
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
