import { describe, expect, it } from "vitest";
import { isSubscriptionRenewal } from "../../../../../app/server/billing/subscription/renewal.server";

describe("isSubscriptionRenewal", () => {
  it("detects period end moved forward", () => {
    const previous = {
      status: "ACTIVE",
      currentPeriodEnd: new Date("2026-01-01T00:00:00Z"),
    };
    expect(
      isSubscriptionRenewal(
        previous as Parameters<typeof isSubscriptionRenewal>[0],
        new Date("2026-02-01T00:00:00Z"),
      ),
    ).toBe(true);
  });

  it("returns false without previous period end", () => {
    expect(isSubscriptionRenewal(null, new Date("2026-02-01T00:00:00Z"))).toBe(
      false,
    );
  });
});
