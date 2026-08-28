import {
  APP_SUBSCRIPTION_REPLACEMENT_BEHAVIOR,
  type AppSubscriptionReplacementBehavior,
} from "../types.server";

/**
 * 换套餐时的 Shopify replacementBehavior：
 * 新价 > 旧价 → 立即替换；新价 ≤ 旧价 → 下周期生效。
 */
export function resolveReplacementBehavior(params: {
  currentPriceAmount: string;
  newPriceAmount: string;
}): Exclude<AppSubscriptionReplacementBehavior, "STANDARD"> {
  const current = Number.parseFloat(params.currentPriceAmount);
  const next = Number.parseFloat(params.newPriceAmount);
  if (!Number.isFinite(current) || !Number.isFinite(next)) {
    return APP_SUBSCRIPTION_REPLACEMENT_BEHAVIOR.APPLY_IMMEDIATELY;
  }
  if (next > current) {
    return APP_SUBSCRIPTION_REPLACEMENT_BEHAVIOR.APPLY_IMMEDIATELY;
  }
  return APP_SUBSCRIPTION_REPLACEMENT_BEHAVIOR.APPLY_ON_NEXT_BILLING_CYCLE;
}
