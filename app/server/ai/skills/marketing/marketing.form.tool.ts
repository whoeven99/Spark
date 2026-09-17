import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import {
  PRODUCT_IMPROVE_FORM_PAYLOAD_KIND,
  coerceProductImproveFormPayload,
  type ProductImproveFormPayload,
} from "../../../../lib/productImproveFormPayload";

export const OPEN_PRODUCT_IMPROVE_FORM_TOOL_NAME = "open_product_improve_form";

/**
 * 当用户要生成/优化商品描述时调用：在聊天内展示可编辑卡片（不直接调用生成 API）。
 */
export const productImproveFormTool = new DynamicStructuredTool({
  name: OPEN_PRODUCT_IMPROVE_FORM_TOOL_NAME,
  description:
    "生成/优化商品标题、描述等营销文案时用（卡片确认后再生成）。不要用于翻译图片上的文字（用 open_picture_translate_form），也不要用于文生图或改价/打标。",
  schema: z.object({
    productId: z
      .string()
      .optional()
      .describe("Shopify 商品 ID（纯数字或 gid://shopify/Product/…），已知则预填"),
    targetLanguage: z
      .string()
      .optional()
      .describe("目标语言 BCP47，如 zh-CN、en、ja"),
  }),
  func: async ({ productId, targetLanguage }) => {
    const payload: ProductImproveFormPayload & {
      _sparkKind: typeof PRODUCT_IMPROVE_FORM_PAYLOAD_KIND;
    } = {
      _sparkKind: PRODUCT_IMPROVE_FORM_PAYLOAD_KIND,
      ...coerceProductImproveFormPayload({
        productId: productId ?? "",
        title: "",
        description: "",
        ...(targetLanguage?.trim() ? { targetLanguage: targetLanguage.trim() } : {}),
      }),
    };
    return JSON.stringify(payload);
  },
});
