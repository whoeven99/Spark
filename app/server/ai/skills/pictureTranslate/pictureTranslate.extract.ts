import { ToolMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatMessageAttachment } from "../../../../lib/chatMessage";
import {
  coercePictureTranslateFormPayload,
  isPictureTranslateFormToolPayload,
} from "../../../../lib/pictureTranslateFormPayload";
import { extractMessageText } from "../../utils/langchainMessageText";
import { OPEN_PICTURE_TRANSLATE_FORM_TOOL_NAME } from "./pictureTranslate.form.tool";
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

function toolMessageJsonPayloadString(m: ToolMessage): string | null {
  const fromText = extractMessageText(m).trim();
  if (fromText.startsWith("{")) return fromText;
  const c = m.content as unknown;
  if (c && typeof c === "object" && !Array.isArray(c)) {
    const s = JSON.stringify(c);
    return s.startsWith("{") ? s : null;
  }
  return null;
}

export function extractPictureTranslateFormFromMessages(
  messages: BaseMessage[],
): ReturnType<typeof coercePictureTranslateFormPayload> | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!ToolMessage.isInstance(msg)) continue;
    if (msg.name !== OPEN_PICTURE_TRANSLATE_FORM_TOOL_NAME) continue;

    const raw = toolMessageJsonPayloadString(msg);
    if (!raw) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!isPictureTranslateFormToolPayload(parsed)) continue;

    return coercePictureTranslateFormPayload(parsed);
  }
  return undefined;
}

export function hasPictureTranslateFormToolCall(messages: BaseMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (
      ToolMessage.isInstance(msg) &&
      msg.name === OPEN_PICTURE_TRANSLATE_FORM_TOOL_NAME
    ) {
      return true;
    }
  }
  return false;
}

export function resolvePictureTranslateCardPayload(
  messages: BaseMessage[],
): ReturnType<typeof coercePictureTranslateFormPayload> | undefined {
  return extractPictureTranslateFormFromMessages(messages);
}
