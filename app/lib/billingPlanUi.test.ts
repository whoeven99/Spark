import { describe, expect, it } from "vitest";
import {
  formatTokenUsagePercentDisplay,
  getTokenUsagePercent,
  isActiveSubscriptionPlan,
  isPendingSubscriptionPlan,
  pickSubscriptionPlan,
} from "./billingPlanUi";
import type { PlanRecord } from "./billingPageTypes";

const plans: PlanRecord[] = [
  {
    planKey: "gd_base_monthly",
    appName: "generate-description",
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
    planKey: "gd_pro_annual",
    appName: "generate-description",
    kind: "SUBSCRIPTION",
    billingInterval: "ANNUAL",
    displayName: "Pro (Annual)",
    tokens: 26000000,
    priceAmount: "799.99",
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
});

describe("pickSubscriptionPlan", () => {
  it("按档位与周期选取套餐", () => {
    expect(pickSubscriptionPlan(plans, "MONTHLY", "base")?.planKey).toBe(
      "gd_base_monthly",
    );
    expect(pickSubscriptionPlan(plans, "ANNUAL", "pro")?.planKey).toBe(
      "gd_pro_annual",
    );
    expect(pickSubscriptionPlan(plans, "ANNUAL", "base")).toBeUndefined();
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
