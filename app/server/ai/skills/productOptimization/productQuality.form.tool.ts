import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import {
  PRODUCT_QUALITY_FORM_PAYLOAD_KIND,
  coerceProductQualityFormPayload,
  type ProductQualityFormPayload,
} from "../../../../lib/productQualityFormPayload";

export const OPEN_PRODUCT_QUALITY_FORM_TOOL_NAME = "open_product_quality_form";

/**
 * 当用户要做商品页质量评分时调用：在聊天内展示可交互卡片（不直接评分）。
 */
export const productQualityFormTool = new DynamicStructuredTool({
  name: OPEN_PRODUCT_QUALITY_FORM_TOOL_NAME,
  description:
    "当用户想评估、诊断或了解商品页质量，或要求对商品页做质量评分时使用。在聊天内打开可交互卡片，供用户选择商品后再评分。根据对话尽量填入 productId；不确定可留空由用户在卡片内选择。不要在用户仅闲聊或未提及质量评分/商品页诊断时调用。若用户已明确提供商品 ID 且要求立刻出分，应改用 score_product_quality。",
  schema: z.object({
    productId: z
      .string()
      .optional()
      .describe("Shopify 商品 ID（纯数字或 gid://shopify/Product/…），已知则预填"),
    title: z.string().optional().describe("商品标题，已知则预填"),
  }),
  func: async ({ productId, title }) => {
    const payload: ProductQualityFormPayload & {
      _sparkKind: typeof PRODUCT_QUALITY_FORM_PAYLOAD_KIND;
    } = {
      _sparkKind: PRODUCT_QUALITY_FORM_PAYLOAD_KIND,
      ...coerceProductQualityFormPayload({
        productId: productId ?? "",
        ...(title?.trim() ? { title: title.trim() } : {}),
      }),
    };
    return JSON.stringify(payload);
  },
});
