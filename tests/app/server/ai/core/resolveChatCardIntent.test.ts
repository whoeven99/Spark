import { describe, expect, it } from "vitest";
import {
  assistantClaimsChatCard,
  buildChatCardPayloadFromIntent,
  hasAnyChatCardInUiPayloads,
  reconcileReplyWithChatCards,
  tryDeterministicTaskProposalFromSkills,
} from "../../../../../app/server/ai/core/resolveChatCardIntent.server";
import { BULK_STATUS_EDIT_SKILL_ID, BULK_PRICE_IMPORT_SKILL_ID } from "../../../../../app/lib/taskProposalPayload";

describe("buildChatCardPayloadFromIntent", () => {
  it("injects image generation card for 图片生成 intent", () => {
    const payloads = buildChatCardPayloadFromIntent(
      {
        cardType: "image_generation_form",
        shouldShowCard: true,
        assistantClaimsCardOpened: true,
        imageDescription: "白色咖啡杯",
      },
      "图片生成",
    );
    expect(payloads.imageGenerationCard).toEqual({ description: "白色咖啡杯" });
  });

  it("forces card when assistant claims opened even if shouldShowCard was false", () => {
    const payloads = buildChatCardPayloadFromIntent(
      {
        cardType: "image_generation_form",
        shouldShowCard: false,
        assistantClaimsCardOpened: true,
      },
      "图片生成",
    );
    expect(payloads.imageGenerationCard).toBeDefined();
  });

  it("prefills workspace product onto image generation card", () => {
    const payloads = buildChatCardPayloadFromIntent(
      {
        cardType: "image_generation_form",
        shouldShowCard: true,
        assistantClaimsCardOpened: true,
        imageDescription: "白底主图",
      },
      "[工作台上下文]\n- 已选商品（共 1 个）：\n  • 陶瓷马克杯 [ID: gid://shopify/Product/1]",
    );
    expect(payloads.imageGenerationCard).toEqual({
      description: "白底主图",
      productId: "gid://shopify/Product/1",
      productTitle: "陶瓷马克杯",
    });
  });

  it("injects product quality card for 质量评分 intent", () => {
    const payloads = buildChatCardPayloadFromIntent(
      {
        cardType: "product_quality_form",
        shouldShowCard: true,
        assistantClaimsCardOpened: true,
        productQualityProductId: "gid://shopify/Product/9",
      },
      "帮我做商品页质量评分",
    );
    expect(payloads.productQualityCard).toEqual({
      productId: "gid://shopify/Product/9",
    });
  });

  it("injects health diagnosis card for 今日待办 intent", () => {
    const payloads = buildChatCardPayloadFromIntent(
      {
        cardType: "health_diagnosis_form",
        shouldShowCard: true,
        assistantClaimsCardOpened: true,
      },
      "今日待办与风险",
    );
    expect(payloads.healthDiagnosisCard).toBeDefined();
  });

  it("returns empty when cardType is none", () => {
    const payloads = buildChatCardPayloadFromIntent(
      {
        cardType: "none",
        shouldShowCard: false,
        assistantClaimsCardOpened: false,
      },
      "最近7天销售额",
    );
    expect(payloads).toEqual({});
  });
});

describe("assistantClaimsChatCard", () => {
  it("detects 我来为您打开…确认卡片 phrasing", () => {
    expect(
      assistantClaimsChatCard(
        "我来为您打开批量上下架的确认卡片。由于您还没有说明具体方向，请在卡片中选择：",
      ),
    ).toBe(true);
  });

  it("detects legacy 已为你打开 phrasing", () => {
    expect(assistantClaimsChatCard("已为你打开 AI 图片生成卡片")).toBe(true);
  });
});

describe("tryDeterministicTaskProposalFromSkills", () => {
  it("builds bulk status edit proposal when skill matched", () => {
    const proposal = tryDeterministicTaskProposalFromSkills(
      ["bulkStatusEdit"],
      "帮我批量上下架商品，先确认方向再给预览",
    );
    expect(proposal?.skillId).toBe(BULK_STATUS_EDIT_SKILL_ID);
    expect(proposal?.title).toContain("上下架");
  });

  it("prefills workspace products onto bulk status proposal", () => {
    const proposal = tryDeterministicTaskProposalFromSkills(
      ["bulkStatusEdit"],
      "[工作台上下文]\n- 已选商品（共 1 个）：\n  • 陶瓷马克杯 [ID: gid://shopify/Product/1]\n\n[用户消息]\n批量上下架",
    );
    expect(proposal?.targets.items).toEqual([
      expect.objectContaining({
        id: "gid://shopify/Product/1",
        title: "陶瓷马克杯",
      }),
    ]);
  });

  it("returns null when no deterministic skill matched", () => {
    expect(tryDeterministicTaskProposalFromSkills(["shopOperations"], "今日销售")).toBeNull();
  });

  it("opens an empty price-import card when no file is attached", () => {
    const proposal = tryDeterministicTaskProposalFromSkills(
      ["bulkPriceImport", "sheetImport"],
      "帮我按表格导入商品价格，先打开确认卡让我上传价目表",
    );
    expect(proposal?.skillId).toBe(BULK_PRICE_IMPORT_SKILL_ID);
    expect(proposal?.params.find((field) => field.key === "fileId")).toEqual(
      expect.objectContaining({ type: "file", value: "" }),
    );
  });

  it("prefills fileId from workspace context onto price-import card", () => {
    const proposal = tryDeterministicTaskProposalFromSkills(
      ["bulkPriceImport"],
      "[工作台上下文]\n- 已选文件（共 1 个）：\n    • prices.csv [文件ID: abc123]\n\n[用户消息]\n按表格导入价格",
    );
    expect(proposal?.params.find((field) => field.key === "fileId")?.value).toBe("abc123");
    expect(proposal?.params.find((field) => field.key === "fileName")?.value).toBe("prices.csv");
  });
});

describe("reconcileReplyWithChatCards", () => {
  it("strips misleading card-open lines when no card payload exists", () => {
    const reply = reconcileReplyWithChatCards(
      "已为你打开 AI 图片生成卡片 🎨\n\n使用方式：填写描述",
      {},
    );
    expect(reply).not.toContain("已为你打开");
    expect(reply).toContain("使用方式");
  });

  it("strips 我来为您打开 / 请在卡片中选择 when no card", () => {
    const reply = reconcileReplyWithChatCards(
      "我来为您打开批量上下架的确认卡片。\n\n- 目标状态\n\n请您在卡片中确认后，我会先生成只读的变更预览。",
      {},
    );
    expect(reply).not.toContain("打开批量上下架的确认卡片");
    expect(reply).not.toContain("请您在卡片中确认");
    expect(reply).toContain("目标状态");
  });
});

describe("hasAnyChatCardInUiPayloads", () => {
  it("detects product improve card payload", () => {
    expect(
      hasAnyChatCardInUiPayloads({
        productImproveCardPayload: { productId: "1", title: "t", description: "d" },
      }),
    ).toBe(true);
  });

  it("detects product quality card payload", () => {
    expect(
      hasAnyChatCardInUiPayloads({
        productQualityCard: { productId: "1" },
      }),
    ).toBe(true);
  });
});
