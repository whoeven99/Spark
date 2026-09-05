import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { BULK_PRICE_EDIT_MAX_PRODUCTS } from "../../../../lib/bulkPriceEdit";

export const OPEN_BULK_PRICE_EDIT_FORM_TOOL_NAME = "open_bulk_price_edit_form";

export type BulkPriceEditFormPayload = {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
  priceMode?: string;
  priceValue?: string;
  rounding?: string;
  compareAtMode?: string;
  minPrice?: string;
};

/**
 * 打开批量调价确认卡。工具本身不读也不写 Shopify：
 * 它只把「用户描述的规则」结构化后交给确认卡，读与算发生在用户确认之后的 dry-run 任务里。
 */
export const bulkPriceEditFormTool = new DynamicStructuredTool({
  name: OPEN_BULK_PRICE_EDIT_FORM_TOOL_NAME,
  description:
    "打开「批量调整变体价格」确认卡片。当用户要按规则批量改价或改划线价（如「这批商品降价 10%」「把原价写成划线价」）时调用。调用后不会修改任何商品。",
  schema: z.object({
    products: z
      .array(
        z.object({
          id: z.string().describe("商品 GID，如 gid://shopify/Product/123"),
          title: z.string().optional(),
          imageUrl: z.string().nullable().optional(),
        }),
      )
      .max(BULK_PRICE_EDIT_MAX_PRODUCTS)
      .optional()
      .describe("要调价的商品；从[工作台上下文]的已选商品逐行提取，留空则由前端用已选商品补全"),
    priceMode: z
      .enum(["percent_down", "percent_up", "amount_down", "amount_up", "set_fixed", "unchanged"])
      .optional()
      .describe("调价方式，从用户描述推断；只改划线价时传 unchanged"),
    priceValue: z
      .number()
      .optional()
      .describe("调价数值：percent_* 为百分数（10 = 10%），amount_* / set_fixed 为金额"),
    rounding: z
      .enum(["none", "end99", "end95", "integer"])
      .optional()
      .describe("取整方式，用户没提就传 none"),
    compareAtMode: z
      .enum(["unchanged", "original_price", "clear"])
      .optional()
      .describe(
        "划线价处理：用户说「保留原价作对比/显示折扣」传 original_price，说「去掉划线价」传 clear，否则 unchanged",
      ),
    minPrice: z.number().optional().describe("最低价保护；用户没提就不传"),
  }),
  func: async ({ products, priceMode, priceValue, rounding, compareAtMode, minPrice }) => {
    const payload: BulkPriceEditFormPayload = {
      products: (products ?? []).map((p) => ({
        id: p.id,
        title: p.title?.trim() || p.id,
        imageUrl: p.imageUrl ?? null,
      })),
      ...(priceMode ? { priceMode } : {}),
      ...(priceValue != null ? { priceValue: String(priceValue) } : {}),
      ...(rounding ? { rounding } : {}),
      ...(compareAtMode ? { compareAtMode } : {}),
      ...(minPrice != null ? { minPrice: String(minPrice) } : {}),
    };
    return JSON.stringify(payload);
  },
});
