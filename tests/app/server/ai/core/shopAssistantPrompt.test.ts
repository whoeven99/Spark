import { describe, expect, it } from "vitest";
import {
  buildMerchantCapabilityPrompt,
  buildPostToolNextStepPrompt,
  buildWriteSafetyPrompt,
} from "../../../../../app/server/ai/core/shopAssistantPrompt";
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

describe("buildWriteSafetyPrompt", () => {
  it("states confirm-card write boundary", () => {
    const prompt = buildWriteSafetyPrompt();
    expect(prompt).toContain("open_*_form");
    expect(prompt).toContain("写回");
  });
});

describe("buildPostToolNextStepPrompt", () => {
  it("requires calling downstream tools instead of only summarizing", () => {
    const prompt = buildPostToolNextStepPrompt();
    expect(prompt).toContain("suggestedNextActions");
    expect(prompt).toContain("同一回合立即调用");
  });
});

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
        name: "productOptimization",
        displayName: "商品优化",
        description:
          "含三个子能力：AI 生成/优化商品文案；商品页质量评分（诊断）；商品图片翻译",
        visibility: "public",
      }),
      stubTool({
        name: "productImprove",
        displayName: "AI 生成/优化商品文案",
        description: "生成标题与描述",
        visibility: "internal",
      }),
      stubTool({
        name: "productQualityScore",
        displayName: "商品页质量评分（诊断）",
        visibility: "internal",
      }),
      stubTool({
        name: "pictureTranslate",
        displayName: "商品图片翻译",
        visibility: "internal",
      }),
      stubTool({
        name: "imageGeneration",
        displayName: "图片生成",
        description: "根据提示词生成商品/营销图片",
        visibility: "public",
      }),
      stubTool({
        name: "imageGenerationForm",
        displayName: "文生图卡片",
        visibility: "internal",
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
    expect(prompt).toContain("商品优化");
    expect(prompt).toContain("AI 生成/优化商品文案");
    expect(prompt).toContain("商品页质量评分（诊断）");
    expect(prompt).toContain("商品图片翻译");
    expect(prompt).toContain("图片生成");
    expect(prompt).not.toContain("- AI 生成/优化商品文案");
    expect(prompt).not.toContain("- 商品页质量评分（诊断）");
    expect(prompt).not.toContain("- 商品图片翻译");
    expect(prompt).not.toContain("文生图卡片");
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
