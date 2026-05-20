import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../app/server/tokenUsage/tokenBillingCatalog.server", () => ({
  resolveTokenBillingRule: vi.fn(),
}));

import { resolveTokenBillingRule } from "../../../../app/server/tokenUsage/tokenBillingCatalog.server";
import {
  applyTokenBillingMultiplier,
  billTokenUsage,
} from "../../../../app/server/tokenUsage/applyTokenBilling.server";

describe("applyTokenBillingMultiplier", () => {
  it("ceil-scales total tokens", () => {
    expect(
      applyTokenBillingMultiplier(
        { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        1.5,
      ),
    ).toEqual({
      inputTokens: 150,
      outputTokens: 75,
      totalTokens: 225,
    });
  });
});

describe("billTokenUsage", () => {
  it("applies LLM usage with multiplier", async () => {
    vi.mocked(resolveTokenBillingRule).mockResolvedValue({
      rule: null,
      multiplier: 2,
      baseTokenCost: null,
    });

    const billed = await billTokenUsage({
      appName: "generate-description",
      feature: "product_copy",
      modelKey: "deepseek-chat",
      usage: { total_tokens: 100 },
    });

    expect(billed.totalTokens).toBe(200);
  });

  it("uses baseTokenCost for flat features when usage empty", async () => {
    vi.mocked(resolveTokenBillingRule).mockResolvedValue({
      rule: null,
      multiplier: 1.5,
      baseTokenCost: 2000,
    });

    const billed = await billTokenUsage({
      appName: "generate-description",
      feature: "picture_translate",
      modelKey: "volc-translate",
      usage: {},
    });

    expect(billed.totalTokens).toBe(3000);
  });
});
