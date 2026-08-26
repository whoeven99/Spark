import { describe, expect, it } from "vitest";
import { buildMerchantCapabilityPrompt } from "../../../../../app/server/ai/core/shopAssistantPrompt";
import type { ToolDefinition } from "../../../../../app/server/ai/core/toolRegistry.server";
import type { PlaybookDefinition } from "../../../../../app/server/ai/core/playbookRegistry.server";

function stubTool(
  partial: Pick<ToolDefinition, "name" | "displayName" | "description" | "visibility">,
): ToolDefinition {
  return {
    ...partial,
    createTool: () => {
      throw new Error("not used");
    },
  };
}

describe("buildMerchantCapabilityPrompt", () => {
  it("lists only public skills and playbooks for merchant-facing capability intros", () => {
    const tools: ToolDefinition[] = [
      stubTool({
        name: "shopifyShopMetrics",
        displayName: "经营数据查询",
        description: "查销售额",
        visibility: "public",
      }),
      stubTool({
        name: "searchProducts",
        displayName: "搜索/浏览商品",
        description: "搜商品",
        visibility: "internal",
      }),
      stubTool({
        name: "sendTemplateEmail",
        displayName: "模板邮件发送",
        visibility: "internal",
      }),
    ];

    const playbooks: PlaybookDefinition[] = [
      {
        name: "shopHealthCheck",
        displayName: "经营体检",
        description: "体检报告",
        category: "operations",
        triggerDescription: "体检",
        visibility: "public",
        steps: ["a"],
        run: async () => ({ ok: true, summary: "", steps: [] }),
      },
    ];

    const prompt = buildMerchantCapabilityPrompt(tools, playbooks);

    expect(prompt).toContain("经营数据查询");
    expect(prompt).toContain("经营体检");
    expect(prompt).not.toContain("搜索/浏览商品");
    expect(prompt).not.toContain("模板邮件发送");
    expect(prompt).toContain("internal");
    expect(prompt).toContain("对外能力清单");
  });
});
