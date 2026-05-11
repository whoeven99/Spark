import type { TranslationTaskFormPayload } from "./translationTaskFormPayload";

/** 首页对话消息：助手回复可为「文本 + 可选交互卡片」。 */
export type ChatMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      translationTaskForm?: TranslationTaskFormPayload;
    };
