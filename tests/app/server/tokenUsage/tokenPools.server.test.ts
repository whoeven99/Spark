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
          subscriptionTokens: 500_000,
          purchasedTokens: 100_000,
        },
        510_000,
      ),
    ).toEqual({
      subscriptionTokens: 0,
      purchasedTokens: 90_000,
    });
  });
});

describe("settlePoolsAtRenewal", () => {
  it("续费结算后按量包为真实剩余", () => {
    const account = {
      subscriptionTokens: 500_000,
      purchasedTokens: 100_000,
      usedTokens: 510_000,
    };
    expect(canSettlePoolsAtRenewal(account)).toBe(true);
    expect(settlePoolsAtRenewal(account)).toEqual({
      subscriptionTokens: 0,
      purchasedTokens: 90_000,
    });
  });

  it("used 超过双池之和时不应结算（避免重复扣减）", () => {
    expect(
      canSettlePoolsAtRenewal({
        subscriptionTokens: 0,
        purchasedTokens: 90_000,
        usedTokens: 510_000,
      }),
    ).toBe(false);
  });
});
