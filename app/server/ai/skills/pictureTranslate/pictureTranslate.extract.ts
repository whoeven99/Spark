import { ToolMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatMessageAttachment } from "../../../../lib/chatMessage";
import { extractMessageText } from "../../utils/langchainMessageText";
import { PICTURE_TRANSLATE_TOOL_NAME } from "./pictureTranslate.constants";

type PictureTranslateToolPayload = {
  success?: unknown;
  translatedImage?: unknown;
};

function parsePictureTranslateToolPayload(raw: string): PictureTranslateToolPayload | undefined {
  if (!raw.trim().startsWith("{")) return undefined;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return undefined;
    return parsed as PictureTranslateToolPayload;
  } catch {
    return undefined;
  }
}

export function extractPictureTranslateAttachmentsFromMessages(
  messages: BaseMessage[],
): ChatMessageAttachment[] | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!ToolMessage.isInstance(msg)) continue;
    if (msg.name !== PICTURE_TRANSLATE_TOOL_NAME) continue;

    const payload = parsePictureTranslateToolPayload(extractMessageText(msg));
    const translatedImage =
      payload?.success === true && typeof payload.translatedImage === "string"
        ? payload.translatedImage.trim()
        : "";

    if (!translatedImage) continue;

    return [
      {
        type: "image",
        url: translatedImage,
        alt: "翻译后的图片",
      },
    ];
  }

  return undefined;
}
