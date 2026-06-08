import { describe, expect, it } from "vitest";
import {
  formatPlanTagLabel,
  formatTokenUsagePercentDisplay,
  getTokenUsagePercent,
  isActiveSubscriptionPlan,
  isPendingSubscriptionPlan,
  listSubscriptionPlansForInterval,
  normalizePlanDisplayName,
  pickSubscriptionPlan,
  resolveCurrentPlanLabel,
} from "../../../app/lib/billingPlanUi";
import type { PlanRecord } from "../../../app/lib/billingPageTypes";

const plans: PlanRecord[] = [
  {
    planKey: "spark_base_monthly",
    kind: "SUBSCRIPTION",
    billingInterval: "MONTHLY",
    displayName: "Base (Monthly)",
    tokens: 500000,
    priceAmount: "29.99",
    currencyCode: "USD",
    trialDays: 7,
    shopifyPlanName: null,
  },
  {
    planKey: "spark_pro_annual",
    kind: "SUBSCRIPTION",
    billingInterval: "ANNUAL",
    displayName: "Pro (Annual)",
    tokens: 26000000,
    priceAmount: "799.99",
    currencyCode: "USD",
    trialDays: 7,
    shopifyPlanName: null,
  },
  {
    planKey: "spark_premium_monthly",
    kind: "SUBSCRIPTION",
    billingInterval: "MONTHLY",
    displayName: "Premium (Monthly)",
    tokens: 10000000,
    priceAmount: "99.99",
    currencyCode: "USD",
    trialDays: 7,
    shopifyPlanName: null,
  },
];

describe("token usage percent", () => {
  it("低用量保留两位小数，避免显示 0%", () => {
    const pct = getTokenUsagePercent(1053, 610_000);
    expect(pct).toBeCloseTo(0.1725, 3);
    expect(formatTokenUsagePercentDisplay(pct)).toBe("0.17");
  });

  it("中高用量按档位取整或一位小数", () => {
    expect(formatTokenUsagePercentDisplay(50.4)).toBe("50");
    expect(formatTokenUsagePercentDisplay(5.26)).toBe("5.3");
    expect(formatTokenUsagePercentDisplay(100)).toBe("100");
  });

  it("超额使用时显示超过 100% 的占比", () => {
    const pct = getTokenUsagePercent(11_262, 10_000);
    expect(pct).toBeCloseTo(112.62, 2);
    expect(formatTokenUsagePercentDisplay(pct)).toBe("113");
  });
});

describe("listSubscriptionPlansForInterval", () => {
  it("返回当前周期的全部订阅", () => {
    expect(listSubscriptionPlansForInterval(plans, "MONTHLY").map((p) => p.planKey)).toEqual([
      "spark_base_monthly",
      "spark_premium_monthly",
    ]);
    expect(listSubscriptionPlansForInterval(plans, "ANNUAL").map((p) => p.planKey)).toEqual([
      "spark_pro_annual",
    ]);
  });
});

describe("pickSubscriptionPlan", () => {
  it("按档位与周期选取套餐", () => {
    expect(pickSubscriptionPlan(plans, "MONTHLY", "base")?.planKey).toBe(
      "spark_base_monthly",
    );
    expect(pickSubscriptionPlan(plans, "ANNUAL", "pro")?.planKey).toBe(
      "spark_pro_annual",
    );
    expect(pickSubscriptionPlan(plans, "ANNUAL", "base")).toBeUndefined();
  });
});

describe("plan display labels", () => {
  it("去掉周期后缀并将 Base 显示为 Basic", () => {
    expect(normalizePlanDisplayName("Base (Monthly)", "gd_base_monthly")).toBe("Basic");
    expect(normalizePlanDisplayName("Pro (Monthly)", "gd_pro_monthly")).toBe("Pro");
    expect(normalizePlanDisplayName("Pro (Annual)", "gd_pro_annual")).toBe("Pro");
    expect(normalizePlanDisplayName("Premium (Monthly)", "gd_premium_monthly")).toBe(
      "Premium",
    );
  });

  it("计划标签统一为 xx Plan", () => {
    expect(formatPlanTagLabel("Base (Monthly)", "gd_base_monthly")).toBe("Basic Plan");
    expect(formatPlanTagLabel("Pro (Monthly)", "gd_pro_monthly")).toBe("Pro Plan");
    expect(formatPlanTagLabel("Premium (Monthly)", "gd_premium_monthly")).toBe(
      "Premium Plan",
    );
  });

  it("试用账户展示免费计划而不是免费试用", () => {
    expect(
      resolveCurrentPlanLabel({
        subscription: null,
        trialPlan: plans[0],
        subscriptionPlans: plans,
        account: { trialTokens: 1000 },
        t: (key) => (key === "billing.planFree" ? "免费计划" : key),
      }),
    ).toBe("免费计划");
  });
});

describe("subscription plan status UI", () => {
  const sub = { planKey: "gd_base_monthly", status: "PENDING" as const };

  it("PENDING 不算当前方案，单独标识待确认", () => {
    expect(isActiveSubscriptionPlan("gd_base_monthly", sub)).toBe(false);
    expect(isPendingSubscriptionPlan("gd_base_monthly", sub)).toBe(true);
    expect(isPendingSubscriptionPlan("gd_pro_annual", sub)).toBe(false);
  });

  it("ACTIVE 为当前方案", () => {
    const active = { planKey: "gd_base_monthly", status: "ACTIVE" as const };
    expect(isActiveSubscriptionPlan("gd_base_monthly", active)).toBe(true);
    expect(isPendingSubscriptionPlan("gd_base_monthly", active)).toBe(false);
  });
});
