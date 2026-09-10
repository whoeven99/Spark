import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { PRODUCT_EXPORT_MAX_PRODUCTS } from "../../../../lib/productExport";

export const OPEN_PRODUCT_EXPORT_FORM_TOOL_NAME = "open_product_export_form";

export type ProductExportFormPayload = {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
  exportFormat?: string;
};

export const productExportFormTool = new DynamicStructuredTool({
  name: OPEN_PRODUCT_EXPORT_FORM_TOOL_NAME,
  description:
    "打开「导出商品」确认卡片。一期只导出工作台已选商品（最多 200 个），格式为 Shopify CSV 或 TikTok Catalog Feed CSV。不会修改店铺。没选商品或用户说导出全店时也先开这张卡，让用户在卡片里选商品。",
  schema: z.object({
    products: z
      .array(
        z.object({
          id: z.string(),
          title: z.string().optional(),
          imageUrl: z.string().nullable().optional(),
        }),
      )
      .max(PRODUCT_EXPORT_MAX_PRODUCTS)
      .optional(),
    exportFormat: z.enum(["shopify_csv", "tiktok_csv"]).optional(),
  }),
  func: async ({ products, exportFormat }) =>
    JSON.stringify({
      products: (products ?? []).map((product) => ({
        id: product.id,
        title: product.title?.trim() || product.id,
        imageUrl: product.imageUrl ?? null,
      })),
      ...(exportFormat ? { exportFormat } : {}),
    } satisfies ProductExportFormPayload),
});
