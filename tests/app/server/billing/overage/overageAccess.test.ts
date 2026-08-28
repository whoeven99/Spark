import { describe, expect, it } from "vitest";
import {
  effectiveOverageCapAmount,
  isCapApproaching,
  overageAmountToTokens,
  remainingCapAmount,
  shouldFlushOverage,
  tokensToOverageAmount,
} from "../../../../../app/server/billing/overage/overageMath.server";
import { computeAccess } from "../../../../../app/server/billing/overage/flushOverage.server";
import type { AppSubscription } from "../../../../../app/generated/prisma";

describe("overageMath", () => {
  it("converts tokens to USD at per-thousand rate", () => {
    expect(tokensToOverageAmount(100_000, "0.025")).toBeCloseTo(2.5, 5);
    expect(tokensToOverageAmount(0, "0.025")).toBe(0);
  });

  it("converts USD remaining to tokens", () => {
    expect(overageAmountToTokens(2.5, "0.025")).toBe(100_000);
  });

  it("computes remaining cap", () => {
    expect(
      remainingCapAmount({ cappedAmount: "50", usageBalanceUsed: "12.5" }),
    ).toBeCloseTo(37.5, 5);
  });

  it("effective cap uses local spend limit when lower than Shopify", () => {
    expect(
      effectiveOverageCapAmount({
        cappedAmount: "100.00",
        overageSpendLimit: "40.00",
      }),
    ).toBe("40.00");
    expect(
      effectiveOverageCapAmount({
        cappedAmount: "100.00",
        overageSpendLimit: null,
      }),
    ).toBe("100.00");
  });

  it("flushes at token or dollar threshold", () => {
    expect(
      shouldFlushOverage({ pendingTokens: 100_000, pricePerThousand: "0.025" }),
    ).toBe(true);
    expect(
      shouldFlushOverage({ pendingTokens: 50_000, pricePerThousand: "0.025" }),
    ).toBe(true); // $1.25
    expect(
      shouldFlushOverage({ pendingTokens: 10_000, pricePerThousand: "0.025" }),
    ).toBe(false); // $0.25
  });

  it("detects approaching cap", () => {
    expect(
      isCapApproaching({ cappedAmount: "100", usageBalanceUsed: "90" }),
    ).toBe(true);
    expect(
      isCapApproaching({ cappedAmount: "100", usageBalanceUsed: "80" }),
    ).toBe(false);
  });
});

function sub(partial: Partial<AppSubscription>): AppSubscription {
  return {
    id: "sub-1",
    shop: "demo.myshopify.com",
    planKey: "spark_base_monthly",
    shopifySubscriptionId: "gid://shopify/AppSubscription/1",
    billingInterval: "MONTHLY",
    status: "ACTIVE",
    tokensPerPeriod: 500_000,
    usageLineItemId: "gid://line/1",
    overagePricePerThousand: "0.025",
    cappedAmount: "50.00",
    cappedCurrency: "USD",
    usageBalanceUsed: "0",
    overagePendingTokens: 0,
    overageEnabled: true,
    overageSpendingEnabled: true,
    overageSpendLimit: "50.00",
    trialEndsAt: null,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(),
    cancelledAt: null,
    confirmationUrl: null,
    pendingShopifySubscriptionId: null,
    pendingPlanKey: null,
    pendingConfirmationUrl: null,
    pendingCreatedAt: null,
    rawPayload: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe("computeAccess", () => {
  const account = {
    subscriptionTokens: 1000,
    purchasedTokens: 0,
    trialTokens: 0,
    usedTokens: 500,
  };

  it("allows when included quota remains", () => {
    const access = computeAccess({ account, subscription: sub({}) });
    expect(access.hasAccess).toBe(true);
    expect(access.denialReason).toBe("none");
  });

  it("allows overage when included exhausted and cap remains", () => {
    const access = computeAccess({
      account: { ...account, usedTokens: 1000 },
      subscription: sub({ usageBalanceUsed: "10" }),
    });
    expect(access.hasAccess).toBe(true);
    expect(access.hasIncludedQuota).toBe(false);
    expect(access.overageAvailable).toBe(true);
  });

  it("denies with overage_cap_reached when cap exhausted", () => {
    const access = computeAccess({
      account: { ...account, usedTokens: 1000 },
      subscription: sub({ usageBalanceUsed: "50" }),
    });
    expect(access.hasAccess).toBe(false);
    expect(access.denialReason).toBe("overage_cap_reached");
  });

  it("denies with quota_exhausted for legacy sub without overage", () => {
    const access = computeAccess({
      account: { ...account, usedTokens: 1000 },
      subscription: sub({
        overageEnabled: false,
        usageLineItemId: null,
      }),
    });
    expect(access.hasAccess).toBe(false);
    expect(access.denialReason).toBe("quota_exhausted");
  });

  it("denies with quota_exhausted when overage spending is disabled", () => {
    const access = computeAccess({
      account: { ...account, usedTokens: 1000 },
      subscription: sub({ overageSpendingEnabled: false }),
    });
    expect(access.hasAccess).toBe(false);
    expect(access.overageAvailable).toBe(false);
    expect(access.denialReason).toBe("quota_exhausted");
  });

  it("respects local spend limit below Shopify cappedAmount", () => {
    const access = computeAccess({
      account: { ...account, usedTokens: 1000 },
      subscription: sub({
        cappedAmount: "50.00",
        overageSpendLimit: "10.00",
        usageBalanceUsed: "10.00",
      }),
    });
    expect(access.hasAccess).toBe(false);
    expect(access.overageAvailable).toBe(false);
    expect(access.denialReason).toBe("overage_cap_reached");
  });

  it("does not allow overage during trial", () => {
    const access = computeAccess({
      account: { ...account, usedTokens: 1000 },
      subscription: sub({
        trialEndsAt: new Date(Date.now() + 86400000),
      }),
    });
    expect(access.overageAvailable).toBe(false);
    expect(access.hasAccess).toBe(false);
  });
});
