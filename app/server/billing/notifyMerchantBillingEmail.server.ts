import { loadSessionSnapshotForUninstall } from "../commonEventLog/loadSessionSnapshotForUninstall.server";
import { sendNotificationEmail } from "../email/scenarios/sendNotificationEmail.server";
import {
  buildCreditAccountChange,
  buildPurchaseCreatedVariables,
  buildSubscriptionVariables,
  formatBillingIntervalLabel,
} from "../notifications/buildNotificationVariables.server";
import type { MerchantNotificationEvent } from "../notifications/merchantNotificationEvents";
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
  const sessionSnapshot = await loadSessionForShop(params.shop);
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
      reason:
        params.event === "subscriptionStarted"
          ? "订阅生效"
          : params.event === "subscriptionChanged"
            ? "订阅套餐变更"
            : "订阅取消",
    });
  }

  const variables = buildSubscriptionVariables({
    shop: params.shop,
    occurredAt,
    currentPlanName: currentPlan.displayName,
    previousPlanName: previousPlan?.displayName,
    effectiveAtUtc: undefined,
    billingPeriod: formatBillingIntervalLabel(params.billingInterval),
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
  const sessionSnapshot = await loadSessionForShop(params.shop);
  const variables = buildPurchaseCreatedVariables({
    shop: params.shop,
    occurredAt: new Date(),
    plan: params.plan,
    shopifyPurchaseId: params.shopifyPurchaseId,
    sessionSnapshot,
    creditAccountChange: buildCreditAccountChange({
      creditsBefore: params.purchasedTokensBefore,
      creditsAfter: params.purchasedTokensAfter,
      creditsChanged: params.plan.tokens,
      reason: "积分包购买",
    }),
  });

  console.info(
    `[Billing] before-sendNotificationEmail ${JSON.stringify({
      shop: params.shop,
      event: "purchaseCreated",
      planKey: params.plan.key,
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
