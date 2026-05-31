import type {
  Account,
  AccountPeriodUsage,
  AppSubscription,
  BillingLog,
} from "../../generated/prisma";
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
  BillingToolUsageItem,
  BillingUsagePeriodItem,
} from "../../lib/billingPageTypes";
import { listEnabledPlansForApp, type PlanRecord } from "./plans/planCatalog.server";
import {
  APP_SUBSCRIPTION_STATUS,
  BILLING_LOG_EVENT,
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

function toBillingToolUsageItem(row: BillingLog): BillingToolUsageItem | null {
  const metadata =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : null;

  const feature =
    metadata && typeof metadata.feature === "string"
      ? metadata.feature
      : null;
  const modelKey =
    metadata && typeof metadata.modelKey === "string"
      ? metadata.modelKey
      : "_default";

  const billedFromMeta =
    metadata && typeof metadata.billedTokens === "number"
      ? metadata.billedTokens
      : null;
  const rawFromMeta =
    metadata && typeof metadata.rawTokens === "number"
      ? metadata.rawTokens
      : null;

  const billedTokens =
    billedFromMeta != null
      ? Math.max(0, Math.floor(billedFromMeta))
      : row.tokensDelta != null
        ? Math.max(0, Math.abs(row.tokensDelta))
        : row.usedTokens != null
          ? Math.max(0, row.usedTokens)
          : 0;

  const rawTokens =
    rawFromMeta != null
      ? Math.max(0, Math.floor(rawFromMeta))
      : billedTokens;

  if (!feature || billedTokens <= 0) return null;

  return {
    id: row.id,
    feature,
    modelKey,
    rawTokens,
    billedTokens,
    createdAt: row.createdAt.toISOString(),
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
  const [usageHistoryRows, billingHistoryRows, toolUsageRows] = await Promise.all([
    prisma.accountPeriodUsage.findMany({
      where: { shop, appName },
      orderBy: { periodEnd: "desc" },
      take: 6,
    }),
    prisma.billingLog.findMany({
      where: {
        shop,
        appName,
        eventType: {
          not: BILLING_LOG_EVENT.TOOL_TOKEN_USED,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.billingLog.findMany({
      where: {
        shop,
        appName,
        eventType: BILLING_LOG_EVENT.TOOL_TOKEN_USED,
      },
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
    toolUsageHistory: toolUsageRows
      .map(toBillingToolUsageItem)
      .filter((row): row is BillingToolUsageItem => row != null),
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
