import { describe, expect, it } from "vitest";
import { subscriptionTokensAfterCancel } from "./activateSubscription.server";

describe("subscriptionTokensAfterCancel", () => {
  it("扣减订阅套餐额度，subscriptionTokens 归零", () => {
    expect(subscriptionTokensAfterCancel(500_000, 500_000)).toEqual({
      nextSubscriptionTokens: 0,
      removedTokens: 500_000,
      tokensDelta: -500_000,
    });
  });

  it("订阅池小于套餐额度时扣到 0", () => {
    expect(subscriptionTokensAfterCancel(100_000, 500_000)).toEqual({
      nextSubscriptionTokens: 0,
      removedTokens: 100_000,
      tokensDelta: -100_000,
    });
  });

  it("订阅池已为 0 时不变", () => {
    expect(subscriptionTokensAfterCancel(0, 500_000)).toEqual({
      nextSubscriptionTokens: 0,
      removedTokens: 0,
      tokensDelta: 0,
    });
  });
});
