import { loadSessionSnapshotForUninstall } from "../commonEventLog/loadSessionSnapshotForUninstall.server";
import { sendNotificationEmail } from "../email/scenarios/sendNotificationEmail.server";
import {
  buildCreditAccountChange,
  buildPurchaseCreatedVariables,
  buildSubscriptionVariables,
} from "../notifications/buildNotificationVariables.server";
import type { CreditReasonKey } from "../notifications/formatNotificationDisplay.server";
import type { MerchantNotificationEvent } from "../notifications/merchantNotificationEvents";
import { fetchShopBasicInfo } from "../shopify/fetchShopBasicInfo.server";
import { getPlanByKey } from "./plans/planCatalog.server";
import type { PlanRecord } from "./plans/planCatalog.server";

async function loadSessionForShop(shop: string) {
  try {
    return await loadSessionSnapshotForUninstall(shop);
  } catch (error) {
    console.warn(
      `[Billing] loadSessionSnapshot for notification failed shop=${shop}`,
      error,
    );
    return null;
  }
}

async function loadShopInfoForBilling(shop: string) {
  try {
    const { unauthenticated } = await import("../../shopify.server");
    const { admin } = await unauthenticated.admin(shop);
    return await fetchShopBasicInfo(admin);
  } catch (error) {
    console.warn(`[Billing] fetchShopBasicInfo failed shop=${shop}`, error);
    return null;
  }
}

function subscriptionCreditReasonKey(
  event: Extract<
    MerchantNotificationEvent,
    "subscriptionStarted" | "subscriptionChanged" | "subscriptionCanceled"
  >,
): CreditReasonKey {
  if (event === "subscriptionStarted") return "subscription_started";
  if (event === "subscriptionChanged") return "subscription_changed";
  return "subscription_canceled";
}

export async function notifyMerchantSubscriptionEmail(params: {
  shop: string;
  appName: string;
  event: Extract<
    MerchantNotificationEvent,
    "subscriptionStarted" | "subscriptionChanged" | "subscriptionCanceled"
  >;
  planKey: string;
  previousPlanKey?: string | null;
  billingInterval: string;
  occurredAt?: Date;
  subscriptionTokensBefore?: number;
  subscriptionTokensAfter?: number;
}): Promise<void> {
  const occurredAt = params.occurredAt ?? new Date();
  const [sessionSnapshot, shopInfo] = await Promise.all([
    loadSessionForShop(params.shop),
    loadShopInfoForBilling(params.shop),
  ]);
  const currentPlan = await getPlanByKey(params.planKey);
  const previousPlan = params.previousPlanKey
    ? await getPlanByKey(params.previousPlanKey)
    : null;

  let creditAccountChange;
  if (
    params.subscriptionTokensBefore != null &&
    params.subscriptionTokensAfter != null
  ) {
    creditAccountChange = buildCreditAccountChange({
      creditsBefore: params.subscriptionTokensBefore,
      creditsAfter: params.subscriptionTokensAfter,
      creditReasonKey: subscriptionCreditReasonKey(params.event),
    });
  }

  const variables = buildSubscriptionVariables({
    shop: params.shop,
    occurredAt,
    currentPlanName: currentPlan.displayName,
    previousPlanName: previousPlan?.displayName,
    effectiveAtUtc: undefined,
    billingInterval: params.billingInterval,
    shopInfo,
    sessionSnapshot,
    creditAccountChange,
  });

  console.info(
    `[Billing] before-sendNotificationEmail ${JSON.stringify({
      shop: params.shop,
      event: params.event,
      planKey: params.planKey,
      billingInterval: params.billingInterval,
    })}`,
  );

  const startedAt = Date.now();
  const result = await sendNotificationEmail({
    event: params.event,
    shop: params.shop,
    appKey: params.appName,
    variables,
    sessionSnapshot,
  });

  console.info(
    `[Billing] after-sendNotificationEmail ${JSON.stringify({
      shop: params.shop,
      event: params.event,
      elapsedMs: Date.now() - startedAt,
      sendSuccess: result.ok,
      skipped: "skipped" in result ? result.skipped : false,
      reason: "skipped" in result && result.skipped ? result.reason : undefined,
      requestId: result.ok ? result.requestId : undefined,
      errorCode: !result.ok && !("skipped" in result) ? result.error?.code : undefined,
      errorMessage: !result.ok && !("skipped" in result) ? result.error?.message : undefined,
    })}`,
  );

  if (!result.ok && !("skipped" in result && result.skipped)) {
    console.error(
      `[Billing] merchant subscription email failed shop=${params.shop} event=${params.event}`,
      "error" in result ? result.error : result,
    );
  }
}

export async function notifyMerchantPurchaseEmail(params: {
  shop: string;
  appName: string;
  plan: PlanRecord;
  shopifyPurchaseId: string;
  purchasedTokensBefore: number;
  purchasedTokensAfter: number;
}): Promise<void> {
  const [sessionSnapshot, shopInfo] = await Promise.all([
    loadSessionForShop(params.shop),
    loadShopInfoForBilling(params.shop),
  ]);
  const variables = buildPurchaseCreatedVariables({
    shop: params.shop,
    occurredAt: new Date(),
    plan: params.plan,
    shopifyPurchaseId: params.shopifyPurchaseId,
    shopInfo,
    sessionSnapshot,
    creditAccountChange: buildCreditAccountChange({
      creditsBefore: params.purchasedTokensBefore,
      creditsAfter: params.purchasedTokensAfter,
      creditsChanged: params.plan.tokens,
      creditReasonKey: "credit_pack_purchased",
    }),
  });

  console.info(
    `[Billing] before-sendNotificationEmail ${JSON.stringify({
      shop: params.shop,
      event: "purchaseCreated",
      planKey: params.plan.planKey,
      shopifyPurchaseId: params.shopifyPurchaseId,
    })}`,
  );

  const startedAt = Date.now();
  const result = await sendNotificationEmail({
    event: "purchaseCreated",
    shop: params.shop,
    appKey: params.appName,
    variables,
    sessionSnapshot,
  });

  console.info(
    `[Billing] after-sendNotificationEmail ${JSON.stringify({
      shop: params.shop,
      event: "purchaseCreated",
      elapsedMs: Date.now() - startedAt,
      sendSuccess: result.ok,
      skipped: "skipped" in result ? result.skipped : false,
      reason: "skipped" in result && result.skipped ? result.reason : undefined,
      requestId: result.ok ? result.requestId : undefined,
      errorCode: !result.ok && !("skipped" in result) ? result.error?.code : undefined,
      errorMessage: !result.ok && !("skipped" in result) ? result.error?.message : undefined,
    })}`,
  );

  if (!result.ok && !("skipped" in result && result.skipped)) {
    console.error(
      `[Billing] merchant purchase email failed shop=${params.shop}`,
      "error" in result ? result.error : result,
    );
  }
}
