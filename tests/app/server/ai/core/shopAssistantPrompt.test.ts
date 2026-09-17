import { describe, expect, it } from "vitest";
import {
  buildAnswerShapePrompt,
  buildCapabilityFormattingExamplePrompt,
  buildFileContextCapabilityPrompt,
  buildMerchantCapabilityPrompt,
  buildPostToolNextStepPrompt,
  buildReplyFormattingPrompt,
  buildToolMutexPrompt,
  buildWriteSafetyPrompt,
  getPersonalizedSystemPrompt,
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
    expect(prompt).toContain("同一回合立刻调用");
  });
});

describe("buildToolMutexPrompt", () => {
  it("separates price edit from import and copy from picture translate", () => {
    const prompt = buildToolMutexPrompt();
    expect(prompt).toContain("open_bulk_price_edit_form");
    expect(prompt).toContain("open_product_import_form");
    expect(prompt).toContain("open_picture_translate_form");
    expect(prompt).toContain("改价");
  });
});

describe("buildAnswerShapePrompt", () => {
  it("opens a card only when the action is unambiguous", () => {
    const prompt = buildAnswerShapePrompt();
    expect(prompt).toContain("动作唯一且明确");
    expect(prompt).toContain("直接调用对应 open_*_form");
  });

  it("makes multi-path asks explain the options instead of picking a card", () => {
    const prompt = buildAnswerShapePrompt();
    expect(prompt).toContain("多条路径");
    expect(prompt).toContain("不要替用户挑一张卡开");
  });

  it("asks the model to report the directions it recommended", () => {
    const prompt = buildAnswerShapePrompt();
    expect(prompt).toContain("suggest_next_actions");
  });

  it("keeps advice asks text-first instead of opening the diagnosis card", () => {
    const prompt = buildAnswerShapePrompt();
    expect(prompt).toContain("有什么值得优化的");
    expect(prompt).toContain("不要开 open_health_diagnosis_form");
    expect(prompt).toContain("metrics=summary");
  });

  it("spells out the 现状 / 建议 / 收尾 skeleton for advice asks", () => {
    const prompt = buildAnswerShapePrompt();
    expect(prompt).toContain("现状");
    expect(prompt).toContain("建议");
    expect(prompt).toContain("为什么排这个优先级");
  });

  it("stops the model from letting buttons replace the answer", () => {
    const prompt = buildAnswerShapePrompt();
    expect(prompt).toContain("按钮只是快捷入口，不是回答本身");
    expect(prompt).toContain("禁止只写一两句话就挂按钮");
  });

  it("labels only the 建议 section, not 现状 or 收尾", () => {
    const prompt = buildAnswerShapePrompt();
    expect(prompt).toContain("这段用「建议」当小标题");
    expect(prompt).toContain("直接写，不要加小标题");
    expect(prompt).toContain("不要加小标题；同时调用 suggest_next_actions");
  });

  it("keeps the closing line from restating the chips rendered below it", () => {
    const prompt = buildAnswerShapePrompt();
    expect(prompt).toContain("收尾里不要再把按钮名列一遍");
  });
});

describe("buildReplyFormattingPrompt", () => {
  it("keeps short markdown rules without long capability examples", () => {
    const prompt = buildReplyFormattingPrompt();
    expect(prompt).toContain("### 标题");
    expect(prompt).not.toContain("今日健康诊断");
  });
});

describe("buildMerchantCapabilityPrompt", () => {
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

  it("defaults to short visibility rules without the full public catalog", () => {
    const prompt = buildMerchantCapabilityPrompt(tools, playbooks);
    expect(prompt).toContain("internal");
    expect(prompt).toContain("public");
    expect(prompt).not.toContain("对外能力清单");
    expect(prompt).not.toContain("查指标与今日待办");
    expect(prompt).not.toContain("- 店铺经营");
  });

  it("lists only public skills and playbooks when includeCatalog is true", () => {
    const prompt = buildMerchantCapabilityPrompt(tools, playbooks, {
      includeCatalog: true,
    });

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

describe("getPersonalizedSystemPrompt capability catalog gating", () => {
  const tools: ToolDefinition[] = [
    stubTool({
      name: "shopOperations",
      displayName: "店铺经营",
      description: "查指标与今日待办",
      visibility: "public",
    }),
  ];

  it("omits full catalog and file block for ordinary asks without files", async () => {
    const prompt = await getPersonalizedSystemPrompt(
      { admin: {} as never },
      tools,
      { userText: "帮我看看今天销售额" },
    );
    expect(prompt).not.toContain("对外能力清单");
    expect(prompt).not.toContain("查指标与今日待办");
    expect(prompt).not.toContain("【文件上下文】");
    expect(prompt).not.toContain(buildCapabilityFormattingExamplePrompt());
    expect(prompt).toContain("【写回与确认卡】");
    expect(prompt).toContain("【工具互斥】");
    expect(prompt).toContain("【回复排版】");
    expect(prompt).toContain("【先判目的再作答】");
  });

  it("includes file context only when hasFileContext is true", async () => {
    const prompt = await getPersonalizedSystemPrompt(
      { admin: {} as never },
      tools,
      { userText: "看看这个表", hasFileContext: true },
    );
    expect(prompt).toContain("【文件上下文】");
    expect(prompt).toContain(buildFileContextCapabilityPrompt().slice(0, 8));
  });

  it("includes full catalog and formatting example on discovery asks", async () => {
    const prompt = await getPersonalizedSystemPrompt(
      { admin: {} as never },
      tools,
      { userText: "你有什么功能" },
    );
    expect(prompt).toContain("对外能力清单");
    expect(prompt).toContain("查指标与今日待办");
    expect(prompt).toContain("今日健康诊断");
  });
});
