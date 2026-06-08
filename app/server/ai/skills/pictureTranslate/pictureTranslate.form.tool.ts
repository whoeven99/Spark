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
    "当用户明确表示要翻译图片、商品图、截图中的文字，且需要在卡片里选择图片或确认语言方向时使用。根据对话尽量填入 imageUrl、sourceLanguage、targetLanguage；图片 URL 须为 HTTPS。若用户已提供完整图片 URL 与目标语言且要求立即翻译，应改用 picture_translate 而非本工具。",
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
