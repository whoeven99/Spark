import { ToolMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import { extractPictureTranslateAttachmentsFromMessages } from "../../../../../../app/server/ai/skills/pictureTranslate/extract";
import { PICTURE_TRANSLATE_TOOL_NAME } from "../../../../../../app/server/ai/skills/pictureTranslate/constants";

describe("extractPictureTranslateAttachmentsFromMessages", () => {
  it("extracts translated image from successful picture_translate tool result", () => {
    const messages = [
      new ToolMessage({
        content: JSON.stringify({
          success: true,
          translatedImage: "https://blob.example.com/translated.jpg",
          textBlocks: [],
        }),
        tool_call_id: "call_1",
        name: PICTURE_TRANSLATE_TOOL_NAME,
      }),
    ];

    expect(extractPictureTranslateAttachmentsFromMessages(messages)).toEqual([
      {
        type: "image",
        url: "https://blob.example.com/translated.jpg",
        alt: "翻译后的图片",
      },
    ]);
  });

  it("ignores failed or malformed tool results", () => {
    const messages = [
      new ToolMessage({
        content: JSON.stringify({ success: false, error: "图片翻译失败" }),
        tool_call_id: "call_1",
        name: PICTURE_TRANSLATE_TOOL_NAME,
      }),
      new ToolMessage({
        content: "not json",
        tool_call_id: "call_2",
        name: PICTURE_TRANSLATE_TOOL_NAME,
      }),
    ];

    expect(extractPictureTranslateAttachmentsFromMessages(messages)).toBeUndefined();
  });
});
