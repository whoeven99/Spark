import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { BULK_TAG_EDIT_MAX_PRODUCTS } from "../../../../lib/bulkTagEdit";

export const OPEN_BULK_TAG_EDIT_FORM_TOOL_NAME = "open_bulk_tag_edit_form";

export type BulkTagEditFormPayload = {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
  addTags?: string;
  removeTags?: string;
  removePrefixes?: string;
};

/**
 * 打开批量打标确认卡。工具本身不读也不写 Shopify：
 * 它只把「用户描述的规则」结构化后交给确认卡，读与算发生在用户确认之后的 dry-run 任务里。
 */
export const bulkTagEditFormTool = new DynamicStructuredTool({
  name: OPEN_BULK_TAG_EDIT_FORM_TOOL_NAME,
  description:
    "打开「批量修改商品标签」确认卡片。当用户要批量给商品加标签、去标签或按前缀清理标签（如「这批商品打上夏季清仓」「把 sale- 开头的标签都清掉」）时调用。调用后不会修改任何商品。",
  schema: z.object({
    products: z
      .array(
        z.object({
          id: z.string().describe("商品 GID，如 gid://shopify/Product/123"),
          title: z.string().optional(),
          imageUrl: z.string().nullable().optional(),
        }),
      )
      .max(BULK_TAG_EDIT_MAX_PRODUCTS)
      .optional()
      .describe("要改标签的商品；从[工作台上下文]的已选商品逐行提取，留空则由前端用已选商品补全"),
    addTags: z
      .string()
      .optional()
      .describe("要添加的标签，多个用逗号分隔；用户没要求加标签就不传"),
    removeTags: z
      .string()
      .optional()
      .describe("要移除的标签，多个用逗号分隔；用户没要求去标签就不传"),
    removePrefixes: z
      .string()
      .optional()
      .describe(
        "按前缀清理标签，多个用逗号分隔。用户说「把 sale 开头的标签都删掉」时传 sale；至少 2 个字符",
      ),
  }),
  func: async ({ products, addTags, removeTags, removePrefixes }) => {
    const payload: BulkTagEditFormPayload = {
      products: (products ?? []).map((p) => ({
        id: p.id,
        title: p.title?.trim() || p.id,
        imageUrl: p.imageUrl ?? null,
      })),
      ...(addTags?.trim() ? { addTags: addTags.trim() } : {}),
      ...(removeTags?.trim() ? { removeTags: removeTags.trim() } : {}),
      ...(removePrefixes?.trim() ? { removePrefixes: removePrefixes.trim() } : {}),
    };
    return JSON.stringify(payload);
  },
});
