import { describe, expect, it } from "vitest";
import { pickSubscriptionPlan } from "./billingPlanUi";
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
