import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { INVENTORY_QTY_MAX_PRODUCTS } from "../../../../lib/inventoryQtyEdit";

export const OPEN_INVENTORY_EXPORT_FORM_TOOL_NAME = "open_inventory_export_form";

export type InventoryExportFormPayload = {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
};

export const inventoryExportFormTool = new DynamicStructuredTool({
  name: OPEN_INVENTORY_EXPORT_FORM_TOOL_NAME,
  description:
    "打开「导出库存」确认卡。导出 Shopify 官方按地点库存 CSV（All states）。不改店铺。没选商品也要开卡。",
  schema: z.object({
    products: z
      .array(
        z.object({
          id: z.string().describe("商品 GID"),
          title: z.string().optional(),
          imageUrl: z.string().nullable().optional(),
        }),
      )
      .max(INVENTORY_QTY_MAX_PRODUCTS)
      .optional(),
  }),
  func: async ({ products }) =>
    JSON.stringify({
      products: (products ?? []).map((item) => ({
        id: item.id,
        title: item.title?.trim() || item.id,
        imageUrl: item.imageUrl ?? null,
      })),
    } satisfies InventoryExportFormPayload),
});
