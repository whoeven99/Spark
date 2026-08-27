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
        name: "shopOperations",
        displayName: "店铺经营",
        description: "查指标与今日待办",
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
      stubTool({
        name: "currentTime",
        displayName: "查询当前时间",
        visibility: "internal",
      }),
      stubTool({
        name: "getBillingStatus",
        displayName: "查询套餐与 Token 额度",
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
        visibility: "internal",
        steps: ["a"],
        run: async () => ({ ok: true, summary: "", steps: [] }),
      },
    ];

    const prompt = buildMerchantCapabilityPrompt(tools, playbooks);

    expect(prompt).toContain("店铺经营");
    expect(prompt).not.toContain("经营体检");
    expect(prompt).not.toContain("经营数据查询");
    expect(prompt).not.toContain("健康度与待办");
    expect(prompt).not.toContain("搜索/浏览商品");
    expect(prompt).not.toContain("模板邮件发送");
    expect(prompt).not.toContain("查询当前时间");
    expect(prompt).not.toContain("查询套餐与 Token 额度");
    expect(prompt).toContain("internal");
    expect(prompt).toContain("对外能力清单");
  });
});
