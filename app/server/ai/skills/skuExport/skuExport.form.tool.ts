import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { SKU_EXPORT_MAX_PRODUCTS } from "../../../../lib/skuExport";

export const OPEN_SKU_EXPORT_FORM_TOOL_NAME = "open_sku_export_form";

export type SkuExportFormPayload = {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
};

export const skuExportFormTool = new DynamicStructuredTool({
  name: OPEN_SKU_EXPORT_FORM_TOOL_NAME,
  description:
    "打开「导出 SKU」确认卡。导出 Handle / Option / SKU / 条码 / 重量对照表。只读。没选商品也先开卡。",
  schema: z.object({
    products: z
      .array(
        z.object({
          id: z.string(),
          title: z.string().optional(),
          imageUrl: z.string().nullable().optional(),
        }),
      )
      .max(SKU_EXPORT_MAX_PRODUCTS)
      .optional(),
  }),
  func: async ({ products }) =>
    JSON.stringify({
      products: (products ?? []).map((product) => ({
        id: product.id,
        title: product.title?.trim() || product.id,
        imageUrl: product.imageUrl ?? null,
      })),
    } satisfies SkuExportFormPayload),
});
