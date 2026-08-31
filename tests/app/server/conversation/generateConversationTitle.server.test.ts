import { beforeEach, describe, expect, it, vi } from "vitest";

const loadBillingContext = vi.fn();
const invoke = vi.fn();

vi.mock("../../../../app/server/billing/billingContext.server", () => ({
  loadBillingContext: (...args: unknown[]) => loadBillingContext(...args),
}));

vi.mock("../../../../app/server/ai/core/shopChatGraph.server", () => ({
  getShopSummaryModel: () => ({ invoke }),
}));

vi.mock("../../../../app/server/tokenUsage/index.server", () => ({
  recordChatTokenUsage: vi.fn(),
}));

describe("generateConversationTitle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("skips LLM and billing when shop has no access", async () => {
    loadBillingContext.mockResolvedValue({
      billingRequired: true,
      hasAccess: false,
    });

    const { generateConversationTitle } = await import(
      "../../../../app/server/conversation/generateConversationTitle.server"
    );

    const title = await generateConversationTitle({
      shop: "demo.myshopify.com",
      userText: "帮我看看店铺今天的销量怎么样",
    });

    expect(invoke).not.toHaveBeenCalled();
    expect(title).toContain("帮我看看");
  });
});
