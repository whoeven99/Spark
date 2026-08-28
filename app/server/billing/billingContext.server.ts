import type {
  Account,
  AccountPeriodUsage,
  AppSubscription,
  BillingLog,
  OverageUsageCharge,
  ToolTokenUsageLog,
} from "../../generated/prisma";
import prisma from "../../db.server";
import { getAvailableTokens } from "../tokenUsage/accountBalance.server";
import { isBillingEnabled, isBillingDevCancelEnabled } from "./constants.server";
import { ensureAccount } from "./account/ensureAccount.server";
import type {
  BillingAccessSnapshot,
  BillingPageLoaderData,
  BillingPageSnapshot,
  BillingHistoryItem,
  BillingOverageChargeItem,
  BillingToolUsageItem,
  BillingUsagePeriodItem,
  BillingReturnFlash,
  PendingPlanChangeSnapshot,
} from "../../lib/billingPageTypes";
import { listEnabledPlans, type PlanRecord } from "./plans/planCatalog.server";
import {
  APP_SUBSCRIPTION_STATUS,
  PLAN_CATALOG_KIND,
} from "./types.server";
import {
  computeAccess,
} from "./overage/flushOverage.server";
import type { ReconcileSubscriptionResult } from "./subscription/reconcilePendingSubscriptions.server";
import {
  isCapApproaching,
  remainingCapAmount,
  overageAmountToTokens,
  effectiveOverageCapAmount,
} from "./overage/overageMath.server";
import { loadPromoCampaignSnapshot } from "./promo/promoCampaign.server";

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

function toOverageChargeItem(row: OverageUsageCharge): BillingOverageChargeItem {
  return {
    id: row.id,
    tokens: row.tokens,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toBillingPageSnapshot(ctx: BillingContext): BillingPageSnapshot {
  const sub = ctx.subscription;
  const overageEnabled = Boolean(sub?.overageEnabled && sub?.usageLineItemId);
  const spendingEnabled = sub?.overageSpendingEnabled !== false;
  const effectiveCap = sub
    ? effectiveOverageCapAmount({
        cappedAmount: sub.cappedAmount,
        overageSpendLimit: sub.overageSpendLimit,
      })
    : "0";
  const capRemainingUsd = spendingEnabled
    ? remainingCapAmount({
        cappedAmount: effectiveCap,
        usageBalanceUsed: sub?.usageBalanceUsed,
      })
    : 0;

  return {
    shop: ctx.shop,
    billingRequired: ctx.billingRequired,
    hasAccess: ctx.hasAccess,
    availableTokens: ctx.availableTokens,
    usedTokens: ctx.usedTokens,
    denialReason: ctx.denialReason,
    overage:
      overageEnabled && sub
        ? {
            enabled: true,
            spendingEnabled,
            cappedAmount: effectiveCap,
            shopifyCappedAmount: sub.cappedAmount,
            cappedCurrency: sub.cappedCurrency,
            usageBalanceUsed: sub.usageBalanceUsed,
            pricePerThousand: sub.overagePricePerThousand,
            pendingTokens: sub.overagePendingTokens,
            capRemainingUsd,
            estimatedTokensLeft: spendingEnabled
              ? overageAmountToTokens(
                  capRemainingUsd,
                  sub.overagePricePerThousand,
                )
              : 0,
            approaching:
              spendingEnabled &&
              isCapApproaching({
                cappedAmount: effectiveCap,
                usageBalanceUsed: sub.usageBalanceUsed,
              }),
            capReached:
              spendingEnabled &&
              !ctx.hasAccess &&
              ctx.denialReason === "overage_cap_reached",
          }
        : null,
    account: {
      subscriptionTokens: ctx.account.subscriptionTokens,
      purchasedTokens: ctx.account.purchasedTokens,
    },
    subscription: sub
      ? {
          planKey: sub.planKey,
          status: sub.status,
          billingInterval: sub.billingInterval,
          tokensPerPeriod: sub.tokensPerPeriod,
          currentPeriodStart: toIso(sub.currentPeriodStart),
          currentPeriodEnd: toIso(sub.currentPeriodEnd),
          overageEnabled: Boolean(sub.overageEnabled && sub.usageLineItemId),
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
  options?: {
    reconcileResult?: ReconcileSubscriptionResult | null;
    isBillingReturn?: boolean;
  },
): Promise<BillingPageLoaderData> {
  const ctx = await loadBillingContext(shop);
  const [
    usageHistoryRows,
    billingHistoryRows,
    toolUsageRows,
    overageRows,
    promoCampaign,
  ] = await Promise.all([
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
    prisma.overageUsageCharge.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    loadPromoCampaignSnapshot(shop),
  ]);
  const sub = ctx.subscription;
  const showDevCancelSubscription =
    isBillingDevCancelEnabled() &&
    !!sub &&
    (sub.status === APP_SUBSCRIPTION_STATUS.ACTIVE ||
      sub.status === APP_SUBSCRIPTION_STATUS.PENDING);

  let pendingPlanChange: PendingPlanChangeSnapshot | null = null;
  if (sub?.pendingShopifySubscriptionId && sub.pendingPlanKey) {
    const pendingPlan = ctx.plans.find((p) => p.planKey === sub.pendingPlanKey);
    pendingPlanChange = {
      planKey: sub.pendingPlanKey,
      planName: pendingPlan?.displayName ?? sub.pendingPlanKey,
      confirmationUrl: sub.pendingConfirmationUrl ?? null,
      createdAt: sub.pendingCreatedAt?.toISOString() ?? null,
    };
  }

  let billingReturnFlash: BillingReturnFlash = null;
  if (options?.isBillingReturn) {
    if (pendingPlanChange) {
      billingReturnFlash = "awaiting_shopify_confirm";
    } else if (options.reconcileResult?.clearedDeclined) {
      billingReturnFlash = "plan_unchanged_declined";
    }
  }

  return {
    billing: toBillingPageSnapshot(ctx),
    trialPlan: null,
    subscriptionPlans: ctx.plans.filter(
      (p) => p.kind === PLAN_CATALOG_KIND.SUBSCRIPTION,
    ),
    // Packs disabled for sale; still return empty list (legacy remaining tokens shown via account)
    tokenPacks: [],
    usageHistory: usageHistoryRows.map(toBillingUsagePeriodItem),
    billingHistory: billingHistoryRows.map(toBillingHistoryItem),
    toolUsageHistory: toolUsageRows.map(toBillingToolUsageItem),
    overageCharges: overageRows.map(toOverageChargeItem),
    showDevCancelSubscription,
    pendingPlanChange,
    billingReturnFlash,
    promoCampaign,
  };
}

export type BillingContext = {
  shop: string;
  billingRequired: boolean;
  hasAccess: boolean;
  denialReason: "none" | "quota_exhausted" | "overage_cap_reached";
  availableTokens: number;
  usedTokens: number;
  account: Account;
  subscription: AppSubscription | null;
  plans: PlanRecord[];
  inTrial: boolean;
};

export type BillingUsageSummary = {
  usedTokens: number;
  totalTokens: number;
};

export async function loadBillingUsageSummary(
  shop: string,
): Promise<BillingUsageSummary> {
  const account = await ensureAccount(shop);
  return {
    usedTokens: account.usedTokens,
    totalTokens: getAvailableTokens(account),
  };
}

export async function loadBillingContext(shop: string): Promise<BillingContext> {
  const account = await ensureAccount(shop);
  const subscription = await prisma.appSubscription.findUnique({
    where: { shop },
  });

  const plans = isBillingEnabled() ? await listEnabledPlans() : [];

  const billingRequired = isBillingEnabled();
  const availableTokens = getAvailableTokens(account);
  const access = computeAccess({ account, subscription });
  const hasAccess = !billingRequired || access.hasAccess;

  return {
    shop,
    billingRequired,
    hasAccess,
    denialReason: billingRequired ? access.denialReason : "none",
    availableTokens,
    usedTokens: account.usedTokens,
    account,
    subscription,
    plans,
    inTrial: false,
  };
}
