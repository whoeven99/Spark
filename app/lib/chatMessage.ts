import type { TranslationTaskFormPayload } from "./translationTaskFormPayload";

export type GenerateDescriptionCardPayload = {
  productId: string;
  title: string;
  description: string;
  targetLanguage?: string;
};

/** 首页对话消息：助手回复可为「文本 + 可选交互卡片」。 */
export type ChatMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      translationTaskForm?: TranslationTaskFormPayload;
      /** 为 true 时在气泡内渲染「商品描述生成」交互卡片（走 /api/generate-description）。 */
      generateDescriptionCard?: boolean;
      generateDescriptionCardPayload?: GenerateDescriptionCardPayload;
    };
