import { ToolMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import { extractChatImageAttachmentsFromMessages } from "../../../../../../app/server/ai/skills/shared/imageAttachmentsExtract";
import { GENERATE_PRODUCT_IMAGE_TOOL_NAME } from "../../../../../../app/server/ai/skills/imageGeneration/constants";
import { PICTURE_TRANSLATE_TOOL_NAME } from "../../../../../../app/server/ai/skills/pictureTranslate/constants";

describe("extractChatImageAttachmentsFromMessages", () => {
  it("extracts generated product image attachment", () => {
    const messages = [
      new ToolMessage({
        content: JSON.stringify({
          success: true,
          imageUrl: "https://example.com/gen.png",
        }),
        tool_call_id: "call_1",
        name: GENERATE_PRODUCT_IMAGE_TOOL_NAME,
      }),
    ];

    const attachments = extractChatImageAttachmentsFromMessages(messages);
    expect(attachments).toEqual([
      {
        type: "image",
        url: "https://example.com/gen.png",
        alt: "生成的商品图片",
      },
    ]);
  });

  it("extracts picture translate attachment", () => {
    const messages = [
      new ToolMessage({
        content: JSON.stringify({
          success: true,
          translatedImage: "https://example.com/tr.png",
        }),
        tool_call_id: "call_2",
        name: PICTURE_TRANSLATE_TOOL_NAME,
      }),
    ];

    const attachments = extractChatImageAttachmentsFromMessages(messages);
    expect(attachments?.[0]?.url).toBe("https://example.com/tr.png");
  });
});
