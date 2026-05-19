import { describe, expect, it } from "vitest";
import { subscriptionTokensAfterCancelToTrial } from "./activateSubscription.server";

describe("subscriptionTokensAfterCancelToTrial", () => {
  it("付费订阅池恢复为试用套餐额度", () => {
    expect(subscriptionTokensAfterCancelToTrial(500_000, 10_000)).toEqual({
      nextSubscriptionTokens: 10_000,
      tokensDelta: -490_000,
    });
  });

  it("试用额度为 0 时订阅池归零", () => {
    expect(subscriptionTokensAfterCancelToTrial(100, 0)).toEqual({
      nextSubscriptionTokens: 0,
      tokensDelta: -100,
    });
  });
});
