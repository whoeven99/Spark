import prisma from "../../../db.server";
import { sendTokenPackFeishuNotify } from "../../feishu/scenarios/sendTokenPackFeishuNotify.server";
import { notifyPurchaseCreatedEmail } from "../../notifications/notifyMerchant.server";
import { buildCreditAccountChange } from "../../notifications/buildNotificationVariables.server";
import { getAvailableTokens } from "../../tokenUsage/accountBalance.server";
import { appendBillingLog } from "../billingLog.server";
import { ensureAccount } from "../account/ensureAccount.server";
import type { PlanRecord } from "../plans/planCatalog.server";
import { BILLING_LOG_EVENT } from "../types.server";

const LOG = "[Billing][TokenPackApply]";

export async function applyTokenPackPurchase(params: {
  shop: string;
  appName: string;
  plan: PlanRecord;
  shopifyPurchaseId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { shop, appName, plan, shopifyPurchaseId } = params;

  console.info(
    `${LOG} enter shop=${shop} appName=${appName} planKey=${plan.planKey} purchaseId=${shopifyPurchaseId} tokens=${plan.tokens}`,
  );

  await ensureAccount(shop, appName);

  const prior = await prisma.billingLog.findFirst({
    where: {
      shop,
      appName,
      eventType: BILLING_LOG_EVENT.TOKEN_PACK_PURCHASED,
      referenceId: shopifyPurchaseId,
    },
  });
  if (prior) {
    console.info(
      `${LOG} skip reason=already-purchased shop=${shop} purchaseId=${shopifyPurchaseId} (no feishu/email)`,
    );
    return;
  }

  const accountBefore = await prisma.account.findUnique({
    where: { shop_appName: { shop, appName } },
  });
  const creditsBefore = accountBefore
    ? getAvailableTokens(accountBefore)
    : 0;

  await prisma.account.update({
    where: { shop_appName: { shop, appName } },
    data: {
      purchasedTokens: { increment: plan.tokens },
    },
  });

  const creditsAfter = creditsBefore + plan.tokens;
  const creditAccountChange = buildCreditAccountChange({
    creditsBefore,
    creditsAfter,
    creditsChanged: plan.tokens,
    creditReasonKey: "credit_pack_purchased",
  });

  await appendBillingLog({
    shop,
    appName,
    eventType: BILLING_LOG_EVENT.TOKEN_PACK_PURCHASED,
    planKey: plan.planKey,
    referenceId: shopifyPurchaseId,
    tokensDelta: plan.tokens,
    metadata: params.metadata,
  });

  console.info(`${LOG} notify-feishu-start shop=${shop} planKey=${plan.planKey}`);
  try {
    const feishuResult = await sendTokenPackFeishuNotify({
      shop,
      appName,
      planKey: plan.planKey,
    });
    console.info(
      `${LOG} notify-feishu-done shop=${shop} ok=${feishuResult.ok} skipped=${"skipped" in feishuResult ? feishuResult.skipped : false} reason=${"reason" in feishuResult ? feishuResult.reason : "sent"}`,
    );
  } catch (error) {
    console.error(`${LOG} notify-feishu-failed shop=${shop} appName=${appName}:`, error);
  }

  console.info(`${LOG} notify-email-start shop=${shop} event=purchaseCreated`);
  await notifyPurchaseCreatedEmail({
    shop,
    appName,
    plan,
    shopifyPurchaseId,
    occurredAt: new Date(),
    creditAccountChange,
  });
  console.info(`${LOG} done shop=${shop} purchaseId=${shopifyPurchaseId}`);
}
