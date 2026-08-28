import { describe, expect, it } from "vitest";
import {
  buildChatCardPayloadFromIntent,
  hasAnyChatCardInUiPayloads,
  reconcileReplyWithChatCards,
} from "../../../../../app/server/ai/core/resolveChatCardIntent.server";

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

describe("reconcileReplyWithChatCards", () => {
  it("strips misleading card-open lines when no card payload exists", () => {
    const reply = reconcileReplyWithChatCards(
      "已为你打开 AI 图片生成卡片 🎨\n\n使用方式：填写描述",
      {},
    );
    expect(reply).not.toContain("已为你打开");
    expect(reply).toContain("使用方式");
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
