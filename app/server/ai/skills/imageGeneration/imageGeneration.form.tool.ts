import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import {
  IMAGE_GENERATION_FORM_PAYLOAD_KIND,
  coerceImageGenerationFormPayload,
  type ImageGenerationFormPayload,
} from "../../../../lib/imageGenerationFormPayload";

export const OPEN_IMAGE_GENERATION_FORM_TOOL_NAME = "open_image_generation_form";

/**
 * 当用户要文生图时调用：在聊天内展示可编辑卡片（不直接调用生成 API）。
 */
export const imageGenerationFormTool = new DynamicStructuredTool({
  name: OPEN_IMAGE_GENERATION_FORM_TOOL_NAME,
  description:
    "文生图/商品主图/营销图创作时用（卡片确认画面描述后再生成）。不要用于翻译已有图上的文字，也不要用于改商品文案。",
  schema: z.object({
    description: z
      .string()
      .optional()
      .describe("画面描述 prompt，例如风格、主体、背景、光线等"),
    productId: z
      .string()
      .optional()
      .describe("可选参考商品 ID（gid://shopify/Product/... 或数字 ID）"),
    productTitle: z
      .string()
      .optional()
      .describe("可选参考商品标题，便于卡片预填"),
  }),
  func: async ({ description, productId, productTitle }) => {
    const payload: ImageGenerationFormPayload & {
      _sparkKind: typeof IMAGE_GENERATION_FORM_PAYLOAD_KIND;
    } = {
      _sparkKind: IMAGE_GENERATION_FORM_PAYLOAD_KIND,
      ...coerceImageGenerationFormPayload({
        description: description ?? "",
        productId: productId ?? "",
        productTitle: productTitle ?? "",
      }),
    };
    return JSON.stringify(payload);
  },
});
