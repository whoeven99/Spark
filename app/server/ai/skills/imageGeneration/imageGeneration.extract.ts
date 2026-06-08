import { ToolMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatMessageAttachment } from "../../../../lib/chatMessage";
import { extractMessageText } from "../../utils/langchainMessageText";
import { GENERATE_PRODUCT_IMAGE_TOOL_NAME } from "./imageGeneration.constants";

type ToolPayload = {
  success?: unknown;
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

export function extractGeneratedImageAttachmentsFromMessages(
  messages: BaseMessage[],
): ChatMessageAttachment[] | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!ToolMessage.isInstance(msg)) continue;
    if (msg.name !== GENERATE_PRODUCT_IMAGE_TOOL_NAME) continue;

    const payload = parseToolPayload(extractMessageText(msg));
    const imageUrl =
      payload?.success === true && typeof payload.imageUrl === "string"
        ? payload.imageUrl.trim()
        : "";

    if (!imageUrl) continue;

    return [
      {
        type: "image",
        url: imageUrl,
        alt: "生成的商品图片",
      },
    ];
  }

  return undefined;
}
