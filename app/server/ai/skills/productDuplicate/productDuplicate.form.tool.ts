import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { PRODUCT_DUPLICATE_MAX_PRODUCTS } from "../../../../lib/productDuplicate";

export const OPEN_PRODUCT_DUPLICATE_FORM_TOOL_NAME = "open_product_duplicate_form";

export type ProductDuplicateFormPayload = {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
  titleSuffix?: string;
  includeImages?: string;
  newStatus?: string;
};

export const productDuplicateFormTool = new DynamicStructuredTool({
  name: OPEN_PRODUCT_DUPLICATE_FORM_TOOL_NAME,
  description:
    "打开「复制商品」确认卡片。当用户要复制/拷贝已有商品时调用。默认新商品为草稿并带图。不会立即创建副本。",
  schema: z.object({
    products: z
      .array(
        z.object({
          id: z.string(),
          title: z.string().optional(),
          imageUrl: z.string().nullable().optional(),
        }),
      )
      .max(PRODUCT_DUPLICATE_MAX_PRODUCTS)
      .optional(),
    titleSuffix: z.string().optional().describe("新标题后缀，默认「 (Copy)」"),
    includeImages: z.enum(["true", "false"]).optional(),
    newStatus: z.enum(["DRAFT", "ACTIVE"]).optional(),
  }),
  func: async ({ products, titleSuffix, includeImages, newStatus }) =>
    JSON.stringify({
      products: (products ?? []).map((product) => ({
        id: product.id,
        title: product.title?.trim() || product.id,
        imageUrl: product.imageUrl ?? null,
      })),
      ...(titleSuffix?.trim() ? { titleSuffix: titleSuffix.trim() } : {}),
      ...(includeImages ? { includeImages } : {}),
      ...(newStatus ? { newStatus } : {}),
    } satisfies ProductDuplicateFormPayload),
});
