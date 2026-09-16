import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { INVENTORY_QTY_MAX_PRODUCTS } from "../../../../lib/inventoryQtyEdit";
import type { ShopifyAdminGraphqlClient } from "../shopifyInfo/shopifyInfo.tool";
import { fetchShopLocations } from "../../../shopify/locationReader.server";

export const OPEN_INVENTORY_QTY_EDIT_FORM_TOOL_NAME = "open_inventory_qty_edit_form";

export function createInventoryQtyEditFormTool(admin: ShopifyAdminGraphqlClient) {
  return new DynamicStructuredTool({
    name: OPEN_INVENTORY_QTY_EDIT_FORM_TOOL_NAME,
    description:
      "打开「设置 / 增减 / 清零库存」确认卡。改的是所选仓库的可售库存 Available，不是在库 On hand。没选商品也先开卡。清零必须用户在卡片里确认。",
    schema: z.object({
      products: z
        .array(
          z.object({
            id: z.string(),
            title: z.string().optional(),
            imageUrl: z.string().nullable().optional(),
          }),
        )
        .max(INVENTORY_QTY_MAX_PRODUCTS)
        .optional(),
      mode: z.enum(["set", "adjust", "clear"]).optional(),
      qtyValue: z.number().optional(),
      locationId: z.string().optional(),
    }),
    func: async ({ products, mode, qtyValue, locationId }) => {
      const locations = await fetchShopLocations(admin);
      return JSON.stringify({
        products: (products ?? []).map((product) => ({
          id: product.id,
          title: product.title?.trim() || product.id,
          imageUrl: product.imageUrl ?? null,
        })),
        mode: mode ?? "set",
        qtyValue: qtyValue != null ? String(qtyValue) : "",
        locationId: locationId ?? "",
        locations: locations
          .filter((item) => item.isActive)
          .map((item) => ({
            value: item.id,
            label: item.writable ? item.name : `${item.name}（只读）`,
            writable: item.writable,
          })),
      });
    },
  });
}
