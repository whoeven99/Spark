import { describe, expect, it } from "vitest";
import {
  dbMessageToUiMessage,
  serializeAssistantPayloads,
} from "../../../../../app/routes/page/workspace/messageTransforms";
import {
  IMAGE_GENERATION_SKILL_ID,
  buildImageGenerationProposal,
} from "../../../../../app/lib/taskProposalPayload";
import { MAX_PERSISTED_THINKING_CHARS } from "../../../../../app/lib/thinkingSteps";
import type { ChatStreamFinishPayload } from "../../../../../app/routes/page/chat/useChatStream";

describe("dbMessageToUiMessage image generation", () => {
  it("keeps image_generation taskProposal instead of unwrapping to the legacy card", () => {
    const proposal = buildImageGenerationProposal({
      description: "模特穿着冲浪服，海边阳光",
      productId: "gid://shopify/Product/1",
      productTitle: "冲浪服",
    });
    const message = dbMessageToUiMessage({
      role: "assistant",
      content: "文生图卡片已打开",
      payloads: JSON.stringify({ taskProposal: proposal }),
      createdAt: "2026-08-28T12:00:00.000Z",
    });
    expect(message.taskProposal?.skillId).toBe(IMAGE_GENERATION_SKILL_ID);
    expect(message.taskProposal?.params[0]?.value).toBe("模特穿着冲浪服，海边阳光");
    expect(message.imageGenerationCard).toBeUndefined();
    expect(message.imageGenerationCardPayload).toBeUndefined();
  });

  it("converts legacy imageGenerationCard payloads to taskProposal", () => {
    const message = dbMessageToUiMessage({
      role: "assistant",
      content: "文生图卡片已打开",
      payloads: JSON.stringify({
        imageGenerationCard: true,
        imageGenerationCardPayload: {
          description: "旧卡片描述",
          productId: "gid://shopify/Product/1",
          productTitle: "冲浪服",
        },
      }),
      createdAt: "2026-08-28T12:00:00.000Z",
    });
    expect(message.taskProposal?.skillId).toBe(IMAGE_GENERATION_SKILL_ID);
    expect(message.taskProposal?.params[0]?.value).toBe("旧卡片描述");
    expect(message.taskProposal?.targets.items).toEqual([
      {
        id: "gid://shopify/Product/1",
        title: "冲浪服",
        imageUrl: null,
      },
    ]);
    expect(message.imageGenerationCard).toBeUndefined();
    expect(message.imageGenerationCardPayload).toBeUndefined();
  });

  it("prefers persisted taskProposal when a legacy imageGenerationCard is also present", () => {
    const proposal = buildImageGenerationProposal({
      description: "提案描述优先",
    });
    const message = dbMessageToUiMessage({
      role: "assistant",
      content: "文生图卡片已打开",
      payloads: JSON.stringify({
        taskProposal: proposal,
        imageGenerationCard: true,
        imageGenerationCardPayload: { description: "旧卡片描述" },
      }),
      createdAt: "2026-08-28T12:00:00.000Z",
    });
    expect(message.taskProposal?.params[0]?.value).toBe("提案描述优先");
    expect(message.imageGenerationCard).toBeUndefined();
  });
});

describe("思考步骤落库回读", () => {
  const finishPayload = (
    extra: Partial<ChatStreamFinishPayload>,
  ): ChatStreamFinishPayload => ({ aborted: false, reply: "好的", ...extra });

  it("把步骤与截断后的思考原文写进 payloads", () => {
    const serialized = serializeAssistantPayloads(
      finishPayload({
        thinkingSteps: [
          { label: "tool:get_shopify_shop_metrics", status: "completed" },
          { label: "tool:run_seo_audit", status: "running" },
        ],
        thinkingContent: "x".repeat(MAX_PERSISTED_THINKING_CHARS + 500),
      }),
    );
    const parsed = JSON.parse(serialized ?? "{}") as Record<string, unknown>;
    expect(parsed.thinkingSteps).toHaveLength(2);
    expect(parsed.thinkingContent).toHaveLength(MAX_PERSISTED_THINKING_CHARS);
  });

  it("没有步骤也没有思考时不写字段", () => {
    expect(serializeAssistantPayloads(finishPayload({}))).toBeNull();
  });

  it("回读时丢弃脏步骤", () => {
    const message = dbMessageToUiMessage({
      role: "assistant",
      content: "好的",
      payloads: JSON.stringify({
        thinkingSteps: [
          { label: "tool:search_products", status: "completed" },
          { label: "", status: "completed" },
          { label: "tool:run_seo_audit", status: "unknown" },
        ],
      }),
      createdAt: "2026-09-17T12:00:00.000Z",
    });
    expect(message.thinkingSteps).toEqual([
      { label: "tool:search_products", status: "completed" },
    ]);
  });
});
