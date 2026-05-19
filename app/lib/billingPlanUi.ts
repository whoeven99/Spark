import type { PlanRecord } from "./billingPageTypes";

export type BillingIntervalView = "MONTHLY" | "ANNUAL";

export function formatPlanPrice(
  amount: string,
  currencyCode: string,
  locale: string,
): string {
  const value = Number.parseFloat(amount);
  if (!Number.isFinite(value)) return `$${amount}`;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
  } catch {
    return `$${amount}`;
  }
}

/** 年付相对月付×12 的折扣百分比（四舍五入）。 */
export function computeAnnualDiscountPercent(
  monthly: PlanRecord,
  annual: PlanRecord,
): number | null {
  const monthlyPrice = Number.parseFloat(monthly.priceAmount);
  const annualPrice = Number.parseFloat(annual.priceAmount);
  if (
    !Number.isFinite(monthlyPrice) ||
    !Number.isFinite(annualPrice) ||
    monthlyPrice <= 0
  ) {
    return null;
  }
  const fullYear = monthlyPrice * 12;
  if (fullYear <= annualPrice) return null;
  return Math.round((1 - annualPrice / fullYear) * 100);
}

export function pickSubscriptionByInterval(
  plans: PlanRecord[],
  interval: BillingIntervalView,
): PlanRecord | undefined {
  return plans.find((p) => p.billingInterval === interval);
}

export function isActiveSubscriptionPlan(
  planKey: string,
  subscription: { planKey: string; status: string } | null,
): boolean {
  if (!subscription) return false;
  return (
    subscription.planKey === planKey &&
    (subscription.status === "ACTIVE" || subscription.status === "PENDING")
  );
}

export function resolveCurrentPlanLabel(params: {
  subscription: { planKey: string; status: string } | null;
  trialPlan: PlanRecord | null;
  subscriptionPlans: PlanRecord[];
  account: { trialTokens: number };
  t: (key: string) => string;
}): string {
  const { subscription, trialPlan, subscriptionPlans, account, t } = params;
  if (
    subscription &&
    (subscription.status === "ACTIVE" || subscription.status === "PENDING")
  ) {
    const match = subscriptionPlans.find((p) => p.planKey === subscription.planKey);
    return match?.displayName ?? subscription.planKey;
  }
  if (account.trialTokens > 0 && trialPlan) {
    return trialPlan.displayName;
  }
  return t("billing.planFree");
}
