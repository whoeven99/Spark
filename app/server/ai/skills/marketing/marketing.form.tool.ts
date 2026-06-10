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
    "当用户明确表示要生成、撰写或优化商品描述/营销文案，或要在卡片里选商品并确认后再生成时使用。根据对话尽量填入 productId、targetLanguage；不确定的字段可留空由用户在卡片内补全。不要在用户仅闲聊或未提及商品文案时调用。",
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
