import type {
  Account,
  AccountPeriodUsage,
  AppSubscription,
  BillingLog,
  ToolTokenUsageLog,
} from "../../generated/prisma";
import prisma from "../../db.server";
import {
  getAvailableTokens,
  hasTokenQuota,
} from "../tokenUsage/accountBalance.server";
import { isBillingEnabled, isBillingDevCancelEnabled } from "./constants.server";
import { ensureAccount } from "./account/ensureAccount.server";
import type {
  BillingAccessSnapshot,
  BillingPageLoaderData,
  BillingPageSnapshot,
  BillingHistoryItem,
  BillingToolUsageItem,
  BillingUsagePeriodItem,
} from "../../lib/billingPageTypes";
import { listEnabledPlans, type PlanRecord } from "./plans/planCatalog.server";
import {
  APP_SUBSCRIPTION_STATUS,
  PLAN_CATALOG_KIND,
} from "./types.server";

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function toBillingHistoryItem(row: BillingLog): BillingHistoryItem {
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

function toBillingUsagePeriodItem(row: AccountPeriodUsage): BillingUsagePeriodItem {
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

function toBillingToolUsageItem(row: ToolTokenUsageLog): BillingToolUsageItem {
  return {
    id: row.id,
    feature: row.feature,
    modelKey: row.modelKey,
    rawTokens: row.rawTokens,
    billedTokens: row.billedTokens,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toBillingPageSnapshot(ctx: BillingContext): BillingPageSnapshot {
  return {
    shop: ctx.shop,
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
): Promise<BillingPageLoaderData> {
  const ctx = await loadBillingContext(shop);
  const [usageHistoryRows, billingHistoryRows, toolUsageRows] = await Promise.all([
    prisma.accountPeriodUsage.findMany({
      where: { shop },
      orderBy: { periodEnd: "desc" },
      take: 6,
    }),
    prisma.billingLog.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.toolTokenUsageLog.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  const sub = ctx.subscription;
  const showDevCancelSubscription =
    isBillingDevCancelEnabled() &&
    !!sub &&
    (sub.status === APP_SUBSCRIPTION_STATUS.ACTIVE ||
      sub.status === APP_SUBSCRIPTION_STATUS.PENDING);

  return {
    billing: toBillingPageSnapshot(ctx),
    trialPlan: null,
    subscriptionPlans: ctx.plans.filter(
      (p) => p.kind === PLAN_CATALOG_KIND.SUBSCRIPTION,
    ),
    tokenPacks: ctx.plans.filter((p) => p.kind === PLAN_CATALOG_KIND.ONE_TIME_PACK),
    usageHistory: usageHistoryRows.map(toBillingUsagePeriodItem),
    billingHistory: billingHistoryRows.map(toBillingHistoryItem),
    toolUsageHistory: toolUsageRows.map(toBillingToolUsageItem),
    showDevCancelSubscription,
  };
}

export type BillingContext = {
  shop: string;
  billingRequired: boolean;
  hasAccess: boolean;
  availableTokens: number;
  usedTokens: number;
  account: Account;
  subscription: AppSubscription | null;
  plans: PlanRecord[];
};

export async function loadBillingContext(shop: string): Promise<BillingContext> {

  const account = await ensureAccount(shop);
  const subscription = await prisma.appSubscription.findUnique({
    where: { shop },
  });

  const plans = isBillingEnabled() ? await listEnabledPlans() : [];

  const billingRequired = isBillingEnabled();
  const availableTokens = getAvailableTokens(account);
  const hasAccess = !billingRequired || hasTokenQuota(account);

  return {
    shop,
    billingRequired,
    hasAccess,
    availableTokens,
    usedTokens: account.usedTokens,
    account,
    subscription,
    plans,
  };
}
