import { describe, expect, it } from "vitest";
import { createShopifyShopMetricsTools } from "../../../../../../app/server/ai/skills/shopifyInfo/shopifyInfo.tool";

describe("createShopifyShopMetricsTools", () => {
  it("exposes a single merged metrics tool instead of eight today_* tools", () => {
    const tools = createShopifyShopMetricsTools({
      graphql: async () => new Response("{}", { status: 200 }),
    });
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe("get_shopify_shop_metrics");
  });
});
