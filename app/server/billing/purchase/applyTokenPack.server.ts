import prisma from "../../../db.server";
import { sendTokenPackFeishuNotify } from "../../feishu/scenarios/sendTokenPackFeishuNotify.server";
import { appendBillingLog } from "../billingLog.server";
import { ensureAccount } from "../account/ensureAccount.server";
import type { PlanRecord } from "../plans/planCatalog.server";
import { BILLING_LOG_EVENT } from "../types.server";

export async function applyTokenPackPurchase(params: {
  shop: string;
  appName: string;
  plan: PlanRecord;
  shopifyPurchaseId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { shop, appName, plan, shopifyPurchaseId } = params;

  await ensureAccount(shop, appName);

  const prior = await prisma.billingLog.findFirst({
    where: {
      shop,
      appName,
      eventType: BILLING_LOG_EVENT.TOKEN_PACK_PURCHASED,
      referenceId: shopifyPurchaseId,
    },
  });
  if (prior) return;

  await prisma.account.update({
    where: { shop_appName: { shop, appName } },
    data: {
      purchasedTokens: { increment: plan.tokens },
    },
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

  try {
    await sendTokenPackFeishuNotify({
      shop,
      appName,
      planKey: plan.planKey,
    });
  } catch (error) {
    console.error(
      `[Billing] token pack feishu notify failed shop=${shop} appName=${appName}:`,
      error,
    );
  }

}
