import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { PRODUCT_EXPORT_MAX_PRODUCTS } from "../../../../lib/productExport";
import type { ShopifyAdminGraphqlClient } from "../shopifyInfo/shopifyInfo.tool";
import { fetchShopLocations, locationSelectOptions } from "../../../shopify/locationReader.server";

export const OPEN_INVENTORY_EXPORT_FORM_TOOL_NAME = "open_inventory_export_form";

export function createInventoryExportFormTool(admin: ShopifyAdminGraphqlClient) {
  return new DynamicStructuredTool({
    name: OPEN_INVENTORY_EXPORT_FORM_TOOL_NAME,
    description:
      "打开「导出库存」确认卡。按 Shopify 官方库存 CSV 导出（每变体每仓一行）。只读。没选商品也先开卡。",
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
      locationId: z.string().optional(),
    }),
    func: async ({ products, locationId }) => {
      const locations = locationSelectOptions(await fetchShopLocations(admin));
      return JSON.stringify({
        products: (products ?? []).map((product) => ({
          id: product.id,
          title: product.title?.trim() || product.id,
          imageUrl: product.imageUrl ?? null,
        })),
        locationId: locationId ?? "",
        locations,
      });
    },
  });
}
