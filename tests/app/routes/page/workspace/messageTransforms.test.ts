import { describe, expect, it } from "vitest";
import { dbMessageToUiMessage } from "../../../../../app/routes/page/workspace/messageTransforms";
import {
  IMAGE_GENERATION_SKILL_ID,
  buildImageGenerationProposal,
} from "../../../../../app/lib/taskProposalPayload";

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

  it("still hydrates legacy imageGenerationCard payloads", () => {
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
    expect(message.imageGenerationCard).toBe(true);
    expect(message.imageGenerationCardPayload).toEqual({
      description: "旧卡片描述",
      productId: "gid://shopify/Product/1",
      productTitle: "冲浪服",
    });
    expect(message.taskProposal).toBeUndefined();
  });
});
