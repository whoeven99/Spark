import type { Account, AppSubscription } from "../../generated/prisma";
import prisma from "../../db.server";
import {
  getAvailableTokens,
  hasTokenQuota,
} from "../tokenUsage/accountBalance.server";
import { isBillingEnabledForApp } from "./constants.server";
import { ensureAccount } from "./account/ensureAccount.server";
import { grantProductTrialIfEligible } from "./account/grantTrial.server";
import { listEnabledPlansForApp, type PlanRecord } from "./plans/planCatalog.server";
export type BillingContext = {
  shop: string;
  appName: string;
  billingRequired: boolean;
  hasAccess: boolean;
  availableTokens: number;
  usedTokens: number;
  account: Account;
  subscription: AppSubscription | null;
  plans: PlanRecord[];
};

export async function loadBillingContext(
  shop: string,
  appName: string,
  options?: { grantTrial?: boolean },
): Promise<BillingContext> {
  if (options?.grantTrial !== false && isBillingEnabledForApp(appName)) {
    await grantProductTrialIfEligible(shop, appName);
  }

  const account = await ensureAccount(shop, appName);
  const subscription = await prisma.appSubscription.findUnique({
    where: { shop_appName: { shop, appName } },
  });

  const plans = isBillingEnabledForApp(appName)
    ? await listEnabledPlansForApp(appName)
    : [];

  const billingRequired = isBillingEnabledForApp(appName);
  const availableTokens = getAvailableTokens(account);
  const hasAccess = !billingRequired || hasTokenQuota(account);

  return {
    shop,
    appName,
    billingRequired,
    hasAccess,
    availableTokens,
    usedTokens: account.usedTokens,
    account,
    subscription,
    plans,
  };
}
