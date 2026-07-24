import { ToolMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatMessageAttachment } from "../../../../lib/chatMessage";
import { extractMessageText } from "../../utils/langchainMessageText";
import { GENERATE_PRODUCT_IMAGE_TOOL_NAME } from "../imageGeneration/imageGeneration.constants";
import { PICTURE_TRANSLATE_TOOL_NAME } from "../pictureTranslate/pictureTranslate.constants";

const IMAGE_TOOL_NAMES = new Set([
  PICTURE_TRANSLATE_TOOL_NAME,
  GENERATE_PRODUCT_IMAGE_TOOL_NAME,
]);

type ToolPayload = {
  success?: unknown;
  translatedImage?: unknown;
  imageUrl?: unknown;
};

function parseToolPayload(raw: string): ToolPayload | undefined {
  if (!raw.trim().startsWith("{")) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return undefined;
    return parsed as ToolPayload;
  } catch {
    return undefined;
  }
}

function attachmentFromToolMessage(
  msg: ToolMessage,
): ChatMessageAttachment | undefined {
  const payload = parseToolPayload(extractMessageText(msg));
  if (!payload || payload.success !== true) return undefined;

  if (msg.name === PICTURE_TRANSLATE_TOOL_NAME) {
    const url =
      typeof payload.translatedImage === "string"
        ? payload.translatedImage.trim()
        : "";
    if (!url) return undefined;
    return { type: "image", url, alt: "翻译后的图片" };
  }

  if (msg.name === GENERATE_PRODUCT_IMAGE_TOOL_NAME) {
    const url =
      typeof payload.imageUrl === "string" ? payload.imageUrl.trim() : "";
    if (!url) return undefined;
    return { type: "image", url, alt: "生成的商品图片" };
  }

  return undefined;
}

/** 聊天内嵌图片：整图翻译与文生图工具结果。 */
export function extractChatImageAttachmentsFromMessages(
  messages: BaseMessage[],
): ChatMessageAttachment[] | undefined {
  const attachments: ChatMessageAttachment[] = [];

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!ToolMessage.isInstance(msg)) continue;
    if (!IMAGE_TOOL_NAMES.has(msg.name ?? "")) continue;

    const item = attachmentFromToolMessage(msg);
    if (item) attachments.unshift(item);
  }

  return attachments.length > 0 ? attachments : undefined;
}
