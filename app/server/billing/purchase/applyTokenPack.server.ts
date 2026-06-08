import prisma from "../../../db.server";
import { sendTokenPackFeishuNotify } from "../../feishu/scenarios/sendTokenPackFeishuNotify.server";
import { appendBillingLog } from "../billingLog.server";
import { ensureAccount } from "../account/ensureAccount.server";
import type { PlanRecord } from "../plans/planCatalog.server";
import { BILLING_LOG_EVENT } from "../types.server";

export async function applyTokenPackPurchase(params: {
  shop: string;
  plan: PlanRecord;
  shopifyPurchaseId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { shop, plan, shopifyPurchaseId } = params;

  await ensureAccount(shop);

  const prior = await prisma.billingLog.findFirst({
    where: {
      shop,
      eventType: BILLING_LOG_EVENT.TOKEN_PACK_PURCHASED,
      referenceId: shopifyPurchaseId,
    },
  });
  if (prior) return;

  await prisma.account.update({
    where: { shop },
    data: {
      purchasedTokens: { increment: plan.tokens },
    },
  });

  await appendBillingLog({
    shop,
    eventType: BILLING_LOG_EVENT.TOKEN_PACK_PURCHASED,
    planKey: plan.planKey,
    referenceId: shopifyPurchaseId,
    tokensDelta: plan.tokens,
    metadata: params.metadata,
  });

  try {
    await sendTokenPackFeishuNotify({
      shop,
      appName: "spark",
      planKey: plan.planKey,
    });
  } catch (error) {
    console.error(
      `[Billing] token pack feishu notify failed shop=${shop}:`,
      error,
    );
  }
}
