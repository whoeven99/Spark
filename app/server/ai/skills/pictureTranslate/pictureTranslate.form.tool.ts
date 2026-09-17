import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import {
  PICTURE_TRANSLATE_FORM_PAYLOAD_KIND,
  coercePictureTranslateFormPayload,
  type PictureTranslateFormPayload,
} from "../../../../lib/pictureTranslateFormPayload";
import { DEFAULT_SOURCE_LANGUAGE } from "./pictureTranslate.constants";

export const OPEN_PICTURE_TRANSLATE_FORM_TOOL_NAME = "open_picture_translate_form";

/**
 * 当用户要翻译图片但未提供可执行参数，或需在卡片内选图/确认语言时调用。
 */
export const pictureTranslateFormTool = new DynamicStructuredTool({
  name: OPEN_PICTURE_TRANSLATE_FORM_TOOL_NAME,
  description:
    "翻译商品图/截图里的文字时用（卡片选图与语言）。不是改商品标题描述文案，也不是文生图。已有图片 URL+目标语言且要求立刻翻可用 picture_translate。",
  schema: z.object({
    imageUrl: z
      .string()
      .optional()
      .describe("图片 HTTPS URL，已知则预填"),
    sourceLanguage: z
      .string()
      .optional()
      .describe("源语言代码，默认 auto"),
    targetLanguage: z
      .string()
      .optional()
      .describe("目标语言代码，如 en、ja、zh"),
  }),
  func: async ({ imageUrl, sourceLanguage, targetLanguage }) => {
    const payload: PictureTranslateFormPayload & {
      _sparkKind: typeof PICTURE_TRANSLATE_FORM_PAYLOAD_KIND;
    } = {
      _sparkKind: PICTURE_TRANSLATE_FORM_PAYLOAD_KIND,
      ...coercePictureTranslateFormPayload({
        ...(imageUrl?.trim() ? { imageUrl: imageUrl.trim() } : {}),
        sourceLanguage: sourceLanguage?.trim() || DEFAULT_SOURCE_LANGUAGE,
        targetLanguage: targetLanguage?.trim() || "zh",
      }),
    };
    return JSON.stringify(payload);
  },
});
