import type { Account, AppSubscription } from "../../generated/prisma";
import prisma from "../../db.server";
import {
  getAvailableTokens,
  hasTokenQuota,
} from "../tokenUsage/accountBalance.server";
import { isBillingDevCancelEnabled, isBillingEnabledForApp } from "./constants.server";
import { ensureAccount } from "./account/ensureAccount.server";
import { grantProductTrialIfEligible } from "./account/grantTrial.server";
import type {
  BillingAccessSnapshot,
  BillingPageLoaderData,
  BillingPageSnapshot,
  BillingHistoryItem,
  BillingUsagePeriodItem,
} from "../../lib/billingPageTypes";
import { listEnabledPlansForApp, type PlanRecord } from "./plans/planCatalog.server";
import { APP_SUBSCRIPTION_STATUS, PLAN_CATALOG_KIND } from "./types.server";

const billingDb = prisma as typeof prisma & {
  appSubscription: {
    findUnique: (args: unknown) => Promise<AppSubscription | null>;
  };
  accountPeriodUsage: {
    findMany: (args: unknown) => Promise<
      Array<{
        id: string;
        planKey: string;
        periodStart: Date;
        periodEnd: Date;
        usedTokens: number;
        subscriptionTokensAllocated: number;
        purchasedTokensRemaining: number;
        trialTokensRemaining: number;
        archivedAt: Date;
      }>
    >;
  };
  billingLog: {
    findMany: (args: unknown) => Promise<
      Array<{
        id: string;
        eventType: string;
        planKey: string | null;
        referenceId: string | null;
        tokensDelta: number | null;
        usedTokens: number | null;
        createdAt: Date;
      }>
    >;
  };
};

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function toBillingHistoryItem(row: {
  id: string;
  eventType: string;
  planKey: string | null;
  referenceId: string | null;
  tokensDelta: number | null;
  usedTokens: number | null;
  createdAt: Date;
}): BillingHistoryItem {
  return {
    id: row.id,
    eventType: row.eventType,
    planKey: row.planKey,
    referenceId: row.referenceId,
    tokensDelta: row.tokensDelta,
    usedTokens: row.usedTokens,
    createdAt: row.createdAt.toISOString(),
  };
}

function toBillingUsagePeriodItem(row: {
  id: string;
  planKey: string;
  periodStart: Date;
  periodEnd: Date;
  usedTokens: number;
  subscriptionTokensAllocated: number;
  purchasedTokensRemaining: number;
  trialTokensRemaining: number;
  archivedAt: Date;
}): BillingUsagePeriodItem {
  return {
    id: row.id,
    planKey: row.planKey,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    usedTokens: row.usedTokens,
    subscriptionTokensAllocated: row.subscriptionTokensAllocated,
    purchasedTokensRemaining: row.purchasedTokensRemaining,
    trialTokensRemaining: row.trialTokensRemaining,
    archivedAt: row.archivedAt.toISOString(),
  };
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
  const [usageHistoryRows, billingHistoryRows] = await Promise.all([
    billingDb.accountPeriodUsage.findMany({
      where: { shop, appName },
      orderBy: { periodEnd: "desc" },
      take: 6,
    }),
    billingDb.billingLog.findMany({
      where: { shop, appName },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);
  const sub = ctx.subscription;
  const showDevCancelSubscription =
    isBillingDevCancelEnabled() &&
    !!sub &&
    (sub.status === APP_SUBSCRIPTION_STATUS.ACTIVE ||
      sub.status === APP_SUBSCRIPTION_STATUS.PENDING);

  return {
    appName,
    billing: toBillingPageSnapshot(ctx),
    trialPlan:
      ctx.plans.find((p) => p.kind === PLAN_CATALOG_KIND.INTERNAL_TRIAL) ?? null,
    subscriptionPlans: ctx.plans.filter(
      (p) => p.kind === PLAN_CATALOG_KIND.SUBSCRIPTION,
    ),
    tokenPacks: ctx.plans.filter((p) => p.kind === PLAN_CATALOG_KIND.ONE_TIME_PACK),
    usageHistory: usageHistoryRows.map(toBillingUsagePeriodItem),
    billingHistory: billingHistoryRows.map(toBillingHistoryItem),
    showDevCancelSubscription,
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
  const subscription = await billingDb.appSubscription.findUnique({
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
