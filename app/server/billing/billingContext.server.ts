import type { Account, AppSubscription } from "../../generated/prisma";
import prisma from "../../db.server";
import {
  getAvailableTokens,
  hasTokenQuota,
} from "../tokenUsage/accountBalance.server";
import { isBillingEnabledForApp } from "./constants.server";
import { ensureAccount } from "./account/ensureAccount.server";
import { grantProductTrialIfEligible } from "./account/grantTrial.server";
import type {
  BillingAccessSnapshot,
  BillingPageLoaderData,
  BillingPageSnapshot,
} from "../../lib/billingPageTypes";
import { listEnabledPlansForApp, type PlanRecord } from "./plans/planCatalog.server";
import { PLAN_CATALOG_KIND } from "./types.server";

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function toBillingPageSnapshot(ctx: BillingContext): BillingPageSnapshot {
  return {
    shop: ctx.shop,
    appName: ctx.appName,
    billingRequired: ctx.billingRequired,
    hasAccess: ctx.hasAccess,
    availableTokens: ctx.availableTokens,
    usedTokens: ctx.usedTokens,
    account: {
      subscriptionTokens: ctx.account.subscriptionTokens,
      purchasedTokens: ctx.account.purchasedTokens,
      trialTokens: ctx.account.trialTokens,
    },
    subscription: ctx.subscription
      ? {
          planKey: ctx.subscription.planKey,
          status: ctx.subscription.status,
          billingInterval: ctx.subscription.billingInterval,
          tokensPerPeriod: ctx.subscription.tokensPerPeriod,
          currentPeriodStart: toIso(ctx.subscription.currentPeriodStart),
          currentPeriodEnd: toIso(ctx.subscription.currentPeriodEnd),
          trialEndsAt: toIso(ctx.subscription.trialEndsAt),
        }
      : null,
  };
}

export function toBillingAccessSnapshot(ctx: BillingContext): BillingAccessSnapshot {
  return {
    billingRequired: ctx.billingRequired,
    hasAccess: ctx.hasAccess,
  };
}

export async function loadBillingPageData(
  shop: string,
  appName: string,
): Promise<BillingPageLoaderData> {
  const ctx = await loadBillingContext(shop, appName);
  return {
    appName,
    billing: toBillingPageSnapshot(ctx),
    trialPlan:
      ctx.plans.find((p) => p.kind === PLAN_CATALOG_KIND.INTERNAL_TRIAL) ?? null,
    subscriptionPlans: ctx.plans.filter(
      (p) => p.kind === PLAN_CATALOG_KIND.SUBSCRIPTION,
    ),
    tokenPacks: ctx.plans.filter((p) => p.kind === PLAN_CATALOG_KIND.ONE_TIME_PACK),
  };
}
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
