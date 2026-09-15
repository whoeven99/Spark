import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { ShopifyAdminGraphqlClient } from "../shopifyInfo/shopifyInfo.tool";
import { fetchShopLocations } from "../../../shopify/locationReader.server";
import { INVENTORY_QTY_MAX_PRODUCTS } from "../../../../lib/inventoryQtyEdit";
import type { InventoryLocationOption } from "../../../../lib/inventoryTaskProposals";

export const OPEN_INVENTORY_SET_FORM_TOOL_NAME = "open_inventory_set_form";
export const OPEN_INVENTORY_ADJUST_FORM_TOOL_NAME = "open_inventory_adjust_form";
export const OPEN_INVENTORY_ZERO_FORM_TOOL_NAME = "open_inventory_zero_form";

export type InventoryQtyFormPayload = {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
  locations: InventoryLocationOption[];
  locationId?: string;
  quantity?: string;
  direction?: string;
  amount?: string;
};

const productSchema = z
  .array(
    z.object({
      id: z.string(),
      title: z.string().optional(),
      imageUrl: z.string().nullable().optional(),
    }),
  )
  .max(INVENTORY_QTY_MAX_PRODUCTS)
  .optional();

async function loadLocations(admin: ShopifyAdminGraphqlClient): Promise<InventoryLocationOption[]> {
  try {
    const locations = await fetchShopLocations(admin);
    return locations.map((location) => ({ value: location.id, label: location.name }));
  } catch {
    return [];
  }
}

function mapProducts(
  products: Array<{ id: string; title?: string; imageUrl?: string | null }> | undefined,
): InventoryQtyFormPayload["products"] {
  return (products ?? []).map((item) => ({
    id: item.id,
    title: item.title?.trim() || item.id,
    imageUrl: item.imageUrl ?? null,
  }));
}

export function createInventorySetFormTool(admin: ShopifyAdminGraphqlClient) {
  return new DynamicStructuredTool({
    name: OPEN_INVENTORY_SET_FORM_TOOL_NAME,
    description:
      "打开「设置库存」确认卡。把已选商品在一个地点的可售库存设为指定整数。不会立刻写回。",
    schema: z.object({
      products: productSchema,
      locationId: z.string().optional().describe("地点 GID"),
      quantity: z.number().int().min(0).optional(),
    }),
    func: async ({ products, locationId, quantity }) => {
      const locations = await loadLocations(admin);
      const payload: InventoryQtyFormPayload = {
        products: mapProducts(products),
        locations,
        ...(locationId ? { locationId } : {}),
        ...(quantity != null ? { quantity: String(quantity) } : {}),
      };
      return JSON.stringify(payload);
    },
  });
}

export function createInventoryAdjustFormTool(admin: ShopifyAdminGraphqlClient) {
  return new DynamicStructuredTool({
    name: OPEN_INVENTORY_ADJUST_FORM_TOOL_NAME,
    description:
      "打开「增加/减少库存」确认卡。按地点给可售库存加或减正整数。不会立刻写回。",
    schema: z.object({
      products: productSchema,
      locationId: z.string().optional(),
      direction: z.enum(["up", "down"]).optional(),
      amount: z.number().int().positive().optional(),
    }),
    func: async ({ products, locationId, direction, amount }) => {
      const locations = await loadLocations(admin);
      const payload: InventoryQtyFormPayload = {
        products: mapProducts(products),
        locations,
        ...(locationId ? { locationId } : {}),
        ...(direction ? { direction } : {}),
        ...(amount != null ? { amount: String(amount) } : {}),
      };
      return JSON.stringify(payload);
    },
  });
}

export function createInventoryZeroFormTool(admin: ShopifyAdminGraphqlClient) {
  return new DynamicStructuredTool({
    name: OPEN_INVENTORY_ZERO_FORM_TOOL_NAME,
    description: "打开「清零库存」确认卡。把指定地点的可售库存设为 0。不会立刻写回。",
    schema: z.object({
      products: productSchema,
      locationId: z.string().optional(),
    }),
    func: async ({ products, locationId }) => {
      const locations = await loadLocations(admin);
      const payload: InventoryQtyFormPayload = {
        products: mapProducts(products),
        locations,
        ...(locationId ? { locationId } : {}),
      };
      return JSON.stringify(payload);
    },
  });
}
