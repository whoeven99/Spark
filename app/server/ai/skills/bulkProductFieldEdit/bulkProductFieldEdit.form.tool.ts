import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { BULK_PRODUCT_FIELD_EDIT_MAX_PRODUCTS } from "../../../../lib/bulkProductFieldEdit";

export const OPEN_BULK_PRODUCT_FIELD_EDIT_FORM_TOOL_NAME = "open_bulk_product_field_edit_form";

export type BulkProductFieldEditFormPayload = {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
  field?: string;
  mode?: string;
  value?: string;
};

export const bulkProductFieldEditFormTool = new DynamicStructuredTool({
  name: OPEN_BULK_PRODUCT_FIELD_EDIT_FORM_TOOL_NAME,
  description:
    "打开「批量修改商品字段」确认卡片。当用户要批量改 Vendor、商品类型、SEO 标题或 SEO 描述时调用。不会修改任何商品。不要用这个工具改 handle、价格、标签或上下架。",
  schema: z.object({
    products: z
      .array(
        z.object({
          id: z.string().describe("商品 GID"),
          title: z.string().optional(),
          imageUrl: z.string().nullable().optional(),
        }),
      )
      .max(BULK_PRODUCT_FIELD_EDIT_MAX_PRODUCTS)
      .optional(),
    field: z
      .enum(["vendor", "productType", "seoTitle", "seoDescription"])
      .optional()
      .describe("要改的字段；用户没说清就不要传"),
    mode: z.enum(["set", "clear"]).optional().describe("设为指定值或清空；默认 set"),
    value: z.string().optional().describe("写入的值；mode=set 时必填"),
  }),
  func: async ({ products, field, mode, value }) =>
    JSON.stringify({
      products: (products ?? []).map((product) => ({
        id: product.id,
        title: product.title?.trim() || product.id,
        imageUrl: product.imageUrl ?? null,
      })),
      ...(field ? { field } : {}),
      ...(mode ? { mode } : {}),
      ...(value?.trim() ? { value: value.trim() } : {}),
    } satisfies BulkProductFieldEditFormPayload),
});
