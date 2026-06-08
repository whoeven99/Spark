import { ToolMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatMessageAttachment } from "../../../../lib/chatMessage";
import {
  coerceImageGenerationFormPayload,
  defaultImageGenerationFormPayload,
  isImageGenerationFormToolPayload,
} from "../../../../lib/imageGenerationFormPayload";
import { extractUserIntentText } from "../../../../lib/chatCardFallback";
import { extractMessageText } from "../../utils/langchainMessageText";
import { OPEN_IMAGE_GENERATION_FORM_TOOL_NAME } from "./imageGeneration.form.tool";
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

export function extractImageGenerationFormFromMessages(
  messages: BaseMessage[],
): ReturnType<typeof coerceImageGenerationFormPayload> | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!ToolMessage.isInstance(msg)) continue;
    if (msg.name !== OPEN_IMAGE_GENERATION_FORM_TOOL_NAME) continue;

    const raw = toolMessageJsonPayloadString(msg);
    if (!raw) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!isImageGenerationFormToolPayload(parsed)) continue;

    return coerceImageGenerationFormPayload(parsed);
  }
  return undefined;
}

export function hasImageGenerationFormToolCall(messages: BaseMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (
      ToolMessage.isInstance(msg) &&
      msg.name === OPEN_IMAGE_GENERATION_FORM_TOOL_NAME
    ) {
      return true;
    }
  }
  return false;
}

export function shouldInjectImageGenerationFormFallback(
  lastUserText: string,
  assistantReplyText: string,
): boolean {
  const u = extractUserIntentText(lastUserText);
  const a = assistantReplyText.trim();
  if (!u) return false;

  const userWantsCard =
    /文生图|生成.{0,8}图|生成.{0,8}图片|画一张|绘制|创作.{0,6}图|商品主图|场景图|海报|AI.{0,6}图|AI配图|image generation|生成卡片/i.test(
      u,
    );

  if (!userWantsCard) return false;
  if (/^(生成.{0,8}图|生成.{0,8}图片|文生图)[。.!?\s]*$/i.test(u)) return true;
  if (/生成卡片|文生图卡片|打开卡片/i.test(u)) return true;
  if (!a) return false;

  const assistantSignals =
    /卡片|表单|已为你打开|已为您打开|已经为你打开|已经为您打开|请确认|在卡片|画面描述|打开.{0,8}卡片/i.test(
      a,
    );
  return assistantSignals;
}

export function resolveImageGenerationCardPayload(
  messages: BaseMessage[],
  lastUserText: string,
  assistantReplyRaw: string,
): ReturnType<typeof coerceImageGenerationFormPayload> | undefined {
  const form = extractImageGenerationFormFromMessages(messages);
  if (form) return form;

  if (
    hasImageGenerationFormToolCall(messages) ||
    shouldInjectImageGenerationFormFallback(lastUserText, assistantReplyRaw)
  ) {
    return defaultImageGenerationFormPayload();
  }

  return undefined;
}
