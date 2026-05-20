import { describe, expect, it } from "vitest";
import {
  canSettlePoolsAtRenewal,
  deductTokenUsage,
  settlePoolsAtRenewal,
} from "../../../../app/server/tokenUsage/tokenPools.server";

describe("deductTokenUsage", () => {
  it("先扣订阅，再扣按量包", () => {
    expect(
      deductTokenUsage(
        {
          trialTokens: 0,
          subscriptionTokens: 500_000,
          purchasedTokens: 100_000,
        },
        510_000,
      ),
    ).toEqual({
      trialTokens: 0,
      subscriptionTokens: 0,
      purchasedTokens: 90_000,
    });
  });

  it("有试用时先扣试用", () => {
    expect(
      deductTokenUsage(
        {
          trialTokens: 5_000,
          subscriptionTokens: 100,
          purchasedTokens: 50,
        },
        7_000,
      ),
    ).toEqual({
      trialTokens: 0,
      subscriptionTokens: 0,
      purchasedTokens: 0,
    });
  });
});

describe("settlePoolsAtRenewal", () => {
  it("续费结算后按量包为真实剩余", () => {
    const account = {
      subscriptionTokens: 500_000,
      purchasedTokens: 100_000,
      trialTokens: 0,
      usedTokens: 510_000,
    };
    expect(canSettlePoolsAtRenewal(account)).toBe(true);
    expect(settlePoolsAtRenewal(account)).toEqual({
      trialTokens: 0,
      subscriptionTokens: 0,
      purchasedTokens: 90_000,
    });
  });

  it("used 超过三池之和时不应结算（避免重复扣减）", () => {
    expect(
      canSettlePoolsAtRenewal({
        subscriptionTokens: 0,
        purchasedTokens: 90_000,
        trialTokens: 0,
        usedTokens: 510_000,
      }),
    ).toBe(false);
  });
});
