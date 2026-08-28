import { describe, expect, it } from "vitest";
import { resolveReplacementBehavior } from "../../../../../app/server/billing/subscription/replacementBehavior.server";
import { mapShopifySubscriptionStatus } from "../../../../../app/server/billing/gateway/shopifyGraphqlBilling.server";
import { APP_SUBSCRIPTION_STATUS } from "../../../../../app/server/billing/types.server";

describe("resolveReplacementBehavior", () => {
  it("升级（新价更高）→ APPLY_IMMEDIATELY", () => {
    expect(
      resolveReplacementBehavior({
        currentPriceAmount: "19.00",
        newPriceAmount: "49.00",
      }),
    ).toBe("APPLY_IMMEDIATELY");
  });

  it("降级（新价更低）→ APPLY_ON_NEXT_BILLING_CYCLE", () => {
    expect(
      resolveReplacementBehavior({
        currentPriceAmount: "49.00",
        newPriceAmount: "19.00",
      }),
    ).toBe("APPLY_ON_NEXT_BILLING_CYCLE");
  });

  it("同价 → APPLY_ON_NEXT_BILLING_CYCLE", () => {
    expect(
      resolveReplacementBehavior({
        currentPriceAmount: "19.00",
        newPriceAmount: "19.00",
      }),
    ).toBe("APPLY_ON_NEXT_BILLING_CYCLE");
  });
});

describe("mapShopifySubscriptionStatus", () => {
  it("DECLINED 映射为 DECLINED，不是 CANCELLED", () => {
    expect(mapShopifySubscriptionStatus("DECLINED")).toBe(
      APP_SUBSCRIPTION_STATUS.DECLINED,
    );
    expect(mapShopifySubscriptionStatus("declined")).toBe(
      APP_SUBSCRIPTION_STATUS.DECLINED,
    );
  });

  it("CANCELLED / EXPIRED 仍映射原状态", () => {
    expect(mapShopifySubscriptionStatus("CANCELLED")).toBe(
      APP_SUBSCRIPTION_STATUS.CANCELLED,
    );
    expect(mapShopifySubscriptionStatus("EXPIRED")).toBe(
      APP_SUBSCRIPTION_STATUS.EXPIRED,
    );
  });
});
