import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../app/db.server", () => ({
  default: {
    account: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock("../../../../app/server/billing/constants.server", () => ({
  isBillingEnabledForApp: vi.fn(),
}));

vi.mock("../../../../app/server/billing/requireBilling.server", () => ({
  requireBillingAccess: vi.fn(),
}));

vi.mock("../../../../app/config/appEntry.server", () => ({
  getAppEntry: vi.fn(() => "product-improve"),
}));

vi.mock("../../../../app/server/tokenUsage/tokenBillingCatalog.server", () => ({
  resolveTokenBillingRule: vi.fn(),
}));

import prisma from "../../../../app/db.server";
import { isBillingEnabledForApp } from "../../../../app/server/billing/constants.server";
import { resolveTokenBillingRule } from "../../../../app/server/tokenUsage/tokenBillingCatalog.server";
import { recordVisualToolTokenUsage } from "../../../../app/server/tokenUsage/visualToolTokenUsage.server";

describe("recordVisualToolTokenUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isBillingEnabledForApp).mockReturnValue(true);
    vi.mocked(resolveTokenBillingRule).mockResolvedValue({
      rule: null,
      multiplier: 2,
      baseTokenCost: 2000,
    });
  });

  afterEach(() => {
    delete process.env.PICTURE_TRANSLATE_TOKEN_COST;
  });

  it("records billed tokens with multiplier", async () => {
    await recordVisualToolTokenUsage({
      shop: "shop.myshopify.com",
      items: [
        {
          feature: "picture_translate",
          modelKey: "volc-translate",
          usage: { totalTokens: 0 },
        },
      ],
    });

    expect(prisma.account.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          usedTokens: { increment: 4000 },
        },
      }),
    );
  });
});
