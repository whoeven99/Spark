import type { TranslationTaskFormPayload } from "./translationTaskFormPayload";

export type ChatMessageImageAttachment = {
  type: "image";
  url: string;
  alt?: string;
};

export type ChatMessageAttachment = ChatMessageImageAttachment;

export type GenerateDescriptionCardPayload = {
  productId: string;
  title: string;
  description: string;
  targetLanguage?: string;
};

function coerceImageAttachment(value: unknown): ChatMessageImageAttachment | undefined {
  if (typeof value !== "object" || value === null) return undefined;

  const candidate = value as {
    type?: unknown;
    url?: unknown;
    alt?: unknown;
  };

  if (candidate.type !== "image") return undefined;
  if (typeof candidate.url !== "string" || !candidate.url.trim()) return undefined;

  return {
    type: "image",
    url: candidate.url.trim(),
    ...(typeof candidate.alt === "string" && candidate.alt.trim()
      ? { alt: candidate.alt.trim() }
      : {}),
  };
}

export function coerceChatMessageAttachments(
  value: unknown,
): ChatMessageAttachment[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => coerceImageAttachment(item))
    .filter((item): item is ChatMessageAttachment => Boolean(item));
}

/** 首页对话消息：助手回复可为「文本 + 可选交互卡片」。 */
export type ChatMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      attachments?: ChatMessageAttachment[];
      translationTaskForm?: TranslationTaskFormPayload;
      /** 为 true 时在气泡内渲染「商品描述生成」交互卡片（走 /api/generate-description）。 */
      generateDescriptionCard?: boolean;
      /** 为 true 时在气泡内渲染「图片翻译」交互卡片（走 /api/picture-translate-chat）。 */
      pictureTranslateCard?: boolean;
      generateDescriptionCardPayload?: GenerateDescriptionCardPayload;
    };
