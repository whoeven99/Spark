import type { PlanRecord } from "./billingPageTypes";

export type BillingIntervalView = "MONTHLY" | "ANNUAL";

/** 订阅档位，与 PlanCatalog `planKey` 中段一致（如 `pi_base_monthly`、`gd_pro_annual`）。 */
export type PlanTier = "base" | "pro";

const TIER_PLAN_KEY_SEGMENT: Record<PlanTier, string> = {
  base: "_base_",
  pro: "_pro_",
};

function stripPlanIntervalSuffix(name: string): string {
  return name.replace(/\s*\((Monthly|Annual)\)\s*$/i, "").trim();
}

function fallbackPlanNameFromKey(planKey: string): string | null {
  const tier = planTierFromPlanKey(planKey);
  if (tier === "base") return "Basic";
  if (tier === "pro") return "Pro";
  if (planKey.includes("trial")) return "Trial";
  return null;
}

export function normalizePlanDisplayName(displayName: string, planKey?: string | null): string {
  const stripped = stripPlanIntervalSuffix(displayName);
  if (/^base$/i.test(stripped)) return "Basic";
  if (/^pro$/i.test(stripped)) return "Pro";
  if (/^free\s+trial$/i.test(stripped)) return "Trial";
  if (stripped.length > 0) return stripped;
  if (planKey) return fallbackPlanNameFromKey(planKey) ?? planKey;
  return displayName;
}

export function formatPlanTagLabel(displayName: string, planKey?: string | null): string {
  const normalized = normalizePlanDisplayName(displayName, planKey);
  if (/plan$/i.test(normalized) || /计划$/.test(normalized)) return normalized;
  return `${normalized} Plan`;
}

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
/** 年付套餐折算为「每月约」展示价（用于定价卡副文案）。 */
export function formatAnnualMonthlyEquivalent(
  annualPlan: PlanRecord,
  locale: string,
): string | null {
  const annualPrice = Number.parseFloat(annualPlan.priceAmount);
  if (!Number.isFinite(annualPrice) || annualPrice <= 0) return null;
  const monthly = annualPrice / 12;
  const rounded =
    monthly % 1 === 0 ? monthly.toFixed(0) : (Math.round(monthly * 100) / 100).toFixed(2);
  return formatPlanPrice(rounded, annualPlan.currencyCode, locale);
}

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

/** Token 已用占比（允许 >100，未取整，供展示与阈值判断）。 */
export function getTokenUsagePercent(usedTokens: number, capacity: number): number {
  if (capacity <= 0 || usedTokens <= 0) return 0;
  return (usedTokens / capacity) * 100;
}

/**
 * 用量百分比展示：≥10% 整数；1–10% 一位小数；<1% 两位小数，避免低用量显示为 0%。
 */
export function formatTokenUsagePercentDisplay(percent: number): string {
  const normalized = Math.max(0, percent);
  if (normalized >= 10) return String(Math.round(normalized));
  if (normalized >= 1) {
    const oneDecimal = normalized.toFixed(1);
    return oneDecimal.endsWith(".0") ? oneDecimal.slice(0, -2) : oneDecimal;
  }
  if (normalized > 0) {
    const twoDecimals = normalized.toFixed(2);
    const trimmed = twoDecimals.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
    return trimmed.length > 0 ? trimmed : "0.01";
  }
  return "0";
}

export function planTierFromPlanKey(planKey: string): PlanTier | null {
  if (planKey.includes(TIER_PLAN_KEY_SEGMENT.base)) return "base";
  if (planKey.includes(TIER_PLAN_KEY_SEGMENT.pro)) return "pro";
  return null;
}

export function pickSubscriptionPlan(
  plans: PlanRecord[],
  interval: BillingIntervalView,
  tier: PlanTier,
): PlanRecord | undefined {
  const segment = TIER_PLAN_KEY_SEGMENT[tier];
  return plans.find(
    (p) => p.billingInterval === interval && p.planKey.includes(segment),
  );
}

/** 当前月付/年付周期下全部付费订阅（不含试用）。 */
export function listSubscriptionPlansForInterval(
  plans: PlanRecord[],
  interval: BillingIntervalView,
): PlanRecord[] {
  return plans
    .filter((p) => p.billingInterval === interval)
    .sort((a, b) => a.planKey.localeCompare(b.planKey));
}

/** @deprecated 多档位时请用 {@link pickSubscriptionPlan} */
export function pickSubscriptionByInterval(
  plans: PlanRecord[],
  interval: BillingIntervalView,
): PlanRecord | undefined {
  return plans.find((p) => p.billingInterval === interval);
}

/** 已生效的付费订阅（不含待 Shopify 确认的 PENDING）。 */
export function isActiveSubscriptionPlan(
  planKey: string,
  subscription: { planKey: string; status: string } | null,
): boolean {
  if (!subscription) return false;
  return subscription.planKey === planKey && subscription.status === "ACTIVE";
}

/** 已发起结账、待商户在 Shopify 确认（PENDING）。 */
export function isPendingSubscriptionPlan(
  planKey: string,
  subscription: { planKey: string; status: string } | null,
): boolean {
  if (!subscription) return false;
  return subscription.planKey === planKey && subscription.status === "PENDING";
}

export function resolveCurrentPlanLabel(params: {
  subscription: { planKey: string; status: string } | null;
  trialPlan: PlanRecord | null;
  subscriptionPlans: PlanRecord[];
  account: { trialTokens: number };
  t: (key: string, options?: Record<string, unknown>) => string;
}): string {
  const { subscription, trialPlan, subscriptionPlans, account, t } = params;
  if (subscription?.status === "PENDING") {
    const match = subscriptionPlans.find((p) => p.planKey === subscription.planKey);
    const name = normalizePlanDisplayName(
      match?.displayName ?? subscription.planKey,
      subscription.planKey,
    );
    return t("billing.pendingPlanLabel", { plan: name });
  }
  if (subscription?.status === "ACTIVE") {
    const match = subscriptionPlans.find((p) => p.planKey === subscription.planKey);
    return normalizePlanDisplayName(
      match?.displayName ?? subscription.planKey,
      subscription.planKey,
    );
  }
  if (account.trialTokens > 0 && trialPlan) {
    return t("billing.planFree");
  }
  return t("billing.planFree");
}
