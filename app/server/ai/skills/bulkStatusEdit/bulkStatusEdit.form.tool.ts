import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { BULK_STATUS_EDIT_MAX_PRODUCTS } from "../../../../lib/bulkStatusEdit";

export const OPEN_BULK_STATUS_EDIT_FORM_TOOL_NAME = "open_bulk_status_edit_form";

export type BulkStatusEditFormPayload = {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
  targetStatus?: string;
  inventoryCondition?: string;
};

/**
 * 打开批量上下架确认卡。工具本身不读也不写 Shopify：
 * 它只把「用户描述的规则」结构化后交给确认卡，读与算发生在用户确认之后的 dry-run 任务里。
 */
export const bulkStatusEditFormTool = new DynamicStructuredTool({
  name: OPEN_BULK_STATUS_EDIT_FORM_TOOL_NAME,
  description:
    "打开「批量上下架商品」确认卡片。当用户要批量把商品上架（Active）或下架为草稿（Draft）时调用，例如「把这批断货的商品下架」「补货到的商品重新上架」。调用后不会修改任何商品。",
  schema: z.object({
    products: z
      .array(
        z.object({
          id: z.string().describe("商品 GID，如 gid://shopify/Product/123"),
          title: z.string().optional(),
          imageUrl: z.string().nullable().optional(),
        }),
      )
      .max(BULK_STATUS_EDIT_MAX_PRODUCTS)
      .optional()
      .describe("要改状态的商品；从[工作台上下文]的已选商品逐行提取，留空则由前端用已选商品补全"),
    targetStatus: z
      .enum(["active", "draft"])
      .optional()
      .describe(
        "目标状态：上架填 active，下架为草稿填 draft。用户没说清方向就不要传，让他在卡片里选",
      ),
    inventoryCondition: z
      .enum(["none", "out_of_stock_only", "in_stock_only"])
      .optional()
      .describe(
        "库存前置条件：用户说「把断货的下架」传 out_of_stock_only，说「有货的上架」传 in_stock_only，没提条件就传 none 或不传",
      ),
  }),
  func: async ({ products, targetStatus, inventoryCondition }) => {
    const payload: BulkStatusEditFormPayload = {
      products: (products ?? []).map((p) => ({
        id: p.id,
        title: p.title?.trim() || p.id,
        imageUrl: p.imageUrl ?? null,
      })),
      ...(targetStatus ? { targetStatus } : {}),
      ...(inventoryCondition ? { inventoryCondition } : {}),
    };
    return JSON.stringify(payload);
  },
});
