import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentContext, ToolDefinition } from "../../core/toolRegistry.server";
import { listShopifyProducts } from "../../../shopify/shopifyObjectList.server";
import { logDetailedError } from "../../../productImprove/generateDescriptionLog.server";

export const SEARCH_PRODUCTS_TOOL_NAME = "search_products";
const LOG_PREFIX = "[SearchProducts]";

const statusFilterSchema = z.enum(["all", "active", "draft", "archived"]);

function createSearchProductsTool(context: AgentContext): DynamicStructuredTool {
  const { admin } = context;
  return new DynamicStructuredTool({
    name: SEARCH_PRODUCTS_TOOL_NAME,
    description:
      "搜索或浏览店铺商品列表。可按标题关键词匹配，也可不传关键词直接列出最近更新商品；支持状态筛选、排序与分页，返回 ID、标题、价格、库存与封面图。",
    schema: z.object({
      keyword: z
        .string()
        .optional()
        .describe('标题关键词，如 "T恤"、"summer dress"；留空则列出最近更新商品'),
      statusFilter: statusFilterSchema
        .optional()
        .describe("商品状态：all / active / draft / archived，默认 all"),
      sort: z
        .enum(["updated_desc", "title_asc"])
        .optional()
        .describe("排序：updated_desc（最近更新）或 title_asc（标题升序）"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("每页条数，默认 10，最大 20"),
      after: z.string().optional().describe("分页游标，上一页返回的 endCursor"),
    }),
    func: async ({ keyword, statusFilter, sort, limit, after }) => {
      const requestId = crypto.randomUUID();
      console.info(
        `${LOG_PREFIX} start requestId=${requestId} keyword="${keyword ?? ""}" limit=${limit ?? 10}`,
      );
      try {
        const result = await listShopifyProducts(admin, {
          keyword: keyword ?? "",
          statusFilter: statusFilter ?? "all",
          sort: sort ?? "updated_desc",
          after: after ?? null,
          first: limit ?? 10,
        });
        console.info(`${LOG_PREFIX} done requestId=${requestId} count=${result.items.length}`);
        return JSON.stringify({
          ok: true,
          count: result.items.length,
          hasNextPage: result.pageInfo.hasNextPage,
          endCursor: result.pageInfo.endCursor,
          products: result.items.map((item) => ({
            id: item.id,
            title: item.title,
            statusLabel: item.statusLabel,
            meta: item.meta,
            featuredImageUrl: item.imageUrl,
          })),
        });
      } catch (e) {
        logDetailedError(LOG_PREFIX, `requestId=${requestId} failed`, e);
        return JSON.stringify({
          ok: false,
          errorMsg: e instanceof Error ? e.message : String(e),
        });
      }
    },
  });
}

export const searchProductsToolDefinition: ToolDefinition = {
  name: "searchProducts",
  displayName: "搜索/浏览商品",
  category: "商品目录",
  stage: "monitor",
  description: "按关键词搜索或分页浏览店铺商品，支持状态筛选与排序",
  systemPromptExtension:
    "当用户要查找、列出或浏览商品（含未提供商品 ID、查看全部/最近更新、按状态筛选）时，调用 search_products。有标题关键词则传 keyword；浏览全部或最近商品可不传 keyword；翻页传 after。拿到商品 ID 后可继续调用 get_product_detail 等工具。",
  createTool: (context) => createSearchProductsTool(context),
};
