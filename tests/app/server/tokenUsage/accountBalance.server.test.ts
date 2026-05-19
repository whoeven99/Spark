import { describe, expect, it } from "vitest";
import { getAvailableTokens, hasTokenQuota } from "../../../../app/server/tokenUsage/accountBalance.server";

describe("getAvailableTokens", () => {
  it("sums pools when availableTokens omitted", () => {
    expect(
      getAvailableTokens({
        subscriptionTokens: 100,
        purchasedTokens: 50,
        trialTokens: 10,
        usedTokens: 0,
      }),
    ).toBe(160);
  });

  it("prefers DB generated column when present", () => {
    expect(
      getAvailableTokens({
        subscriptionTokens: 1,
        purchasedTokens: 1,
        trialTokens: 1,
        availableTokens: 999,
        usedTokens: 0,
      }),
    ).toBe(999);
  });
});

describe("hasTokenQuota", () => {
  it("returns true when used is below available", () => {
    expect(
      hasTokenQuota({
        subscriptionTokens: 100,
        purchasedTokens: 0,
        trialTokens: 0,
        usedTokens: 99,
      }),
    ).toBe(true);
  });

  it("returns false when used equals available", () => {
    expect(
      hasTokenQuota({
        subscriptionTokens: 10,
        purchasedTokens: 0,
        trialTokens: 0,
        usedTokens: 10,
      }),
    ).toBe(false);
  });
});
