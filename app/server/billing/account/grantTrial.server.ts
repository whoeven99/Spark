import prisma from "../../../db.server";
import { appendBillingLog } from "../billingLog.server";
import { getInternalTrialPlan } from "../plans/planCatalog.server";
import { BILLING_LOG_EVENT } from "../types.server";
import { ensureAccount } from "./ensureAccount.server";

/**
 * 产品层免费试用（INTERNAL_TRIAL），每 shop + appName 仅发放一次。
 */
export async function grantProductTrialIfEligible(
  shop: string,
  appName: string,
): Promise<{ granted: boolean; tokens: number }> {
  const plan = await getInternalTrialPlan(appName);
  if (!plan || plan.tokens <= 0) {
    return { granted: false, tokens: 0 };
  }

  const prior = await prisma.billingLog.findFirst({
    where: {
      shop,
      appName,
      eventType: BILLING_LOG_EVENT.TRIAL_GRANTED,
    },
  });
  if (prior) {
    return { granted: false, tokens: 0 };
  }

  await ensureAccount(shop, appName);

  await prisma.account.update({
    where: { shop_appName: { shop, appName } },
    data: {
      trialTokens: { increment: plan.tokens },
    },
  });

  await appendBillingLog({
    shop,
    appName,
    eventType: BILLING_LOG_EVENT.TRIAL_GRANTED,
    planKey: plan.planKey,
    tokensDelta: plan.tokens,
    metadata: { source: "internal_trial" },
  });

  return { granted: true, tokens: plan.tokens };
}
