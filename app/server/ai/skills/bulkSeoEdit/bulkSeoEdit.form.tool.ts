import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { BULK_SEO_EDIT_MAX_PRODUCTS } from "../../../../lib/bulkSeoEdit";

export const OPEN_BULK_SEO_EDIT_FORM_TOOL_NAME = "open_bulk_seo_edit_form";

export type BulkSeoEditFormPayload = {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
  titleTemplate?: string;
  descriptionTemplate?: string;
  onlyFillEmpty?: boolean;
  overflow?: string;
};

/**
 * 打开批量 SEO 改写确认卡。工具本身不读也不写 Shopify：
 * 它只把「用户描述的模板」结构化后交给确认卡，读与渲染发生在用户确认之后的 dry-run 任务里。
 */
export const bulkSeoEditFormTool = new DynamicStructuredTool({
  name: OPEN_BULK_SEO_EDIT_FORM_TOOL_NAME,
  description:
    "打开「批量改写商品 SEO」确认卡片。当用户要批量设置或统一 SEO 标题 / 描述（如「给这批商品统一加上品牌后缀的 SEO 标题」「把没写 SEO 描述的商品都补上」）时调用。调用后不会修改任何商品。",
  schema: z.object({
    products: z
      .array(
        z.object({
          id: z.string().describe("商品 GID，如 gid://shopify/Product/123"),
          title: z.string().optional(),
          imageUrl: z.string().nullable().optional(),
        }),
      )
      .max(BULK_SEO_EDIT_MAX_PRODUCTS)
      .optional()
      .describe("要改 SEO 的商品；从[工作台上下文]的已选商品逐行提取，留空则由前端用已选商品补全"),
    titleTemplate: z
      .string()
      .optional()
      .describe(
        "SEO 标题模板，占位符只能用 {title} {vendor} {productType}，例如「{title} - {vendor}｜正品保障」。用户没要求改标题就不传",
      ),
    descriptionTemplate: z
      .string()
      .optional()
      .describe("SEO 描述模板，占位符同上。用户没要求改描述就不传"),
    onlyFillEmpty: z
      .boolean()
      .optional()
      .describe("用户说「只补没写的 / 不要覆盖已有的」时传 true，默认 false"),
    overflow: z
      .enum(["truncate", "skip"])
      .optional()
      .describe("渲染结果超出长度上限时的处理，默认 truncate（自动截断）"),
  }),
  func: async ({ products, titleTemplate, descriptionTemplate, onlyFillEmpty, overflow }) => {
    const payload: BulkSeoEditFormPayload = {
      products: (products ?? []).map((p) => ({
        id: p.id,
        title: p.title?.trim() || p.id,
        imageUrl: p.imageUrl ?? null,
      })),
      ...(titleTemplate?.trim() ? { titleTemplate: titleTemplate.trim() } : {}),
      ...(descriptionTemplate?.trim()
        ? { descriptionTemplate: descriptionTemplate.trim() }
        : {}),
      ...(onlyFillEmpty != null ? { onlyFillEmpty } : {}),
      ...(overflow ? { overflow } : {}),
    };
    return JSON.stringify(payload);
  },
});
