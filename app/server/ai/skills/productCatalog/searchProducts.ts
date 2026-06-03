import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentContext, ToolDefinition } from "../../core/toolRegistry.server";
import { searchProducts } from "../../../shopify/productSearch.server";
import { logDetailedError } from "../../../productImprove/generateDescriptionLog.server";

export const SEARCH_PRODUCTS_TOOL_NAME = "search_products";
const LOG_PREFIX = "[SearchProducts]";

function createSearchProductsTool(context: AgentContext): DynamicStructuredTool {
  const { admin } = context;
  return new DynamicStructuredTool({
    name: SEARCH_PRODUCTS_TOOL_NAME,
    description:
      "按标题关键词搜索店铺商品列表，返回匹配商品的 ID、标题与封面图。当用户提到某类商品但未给出具体商品 ID、或要求列出商品时使用；可将结果中的 ID 传给其他工具做进一步操作。",
    schema: z.object({
      keyword: z.string().min(1).describe('标题关键词，如 "T恤"、"summer dress"'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("最多返回条数，默认 10，最大 20"),
    }),
    func: async ({ keyword, limit }) => {
      const requestId = crypto.randomUUID();
      console.info(
        `${LOG_PREFIX} start requestId=${requestId} keyword="${keyword}" limit=${limit ?? 10}`,
      );
      try {
        const products = await searchProducts(admin, keyword, { first: limit ?? 10 });
        console.info(`${LOG_PREFIX} done requestId=${requestId} count=${products.length}`);
        return JSON.stringify({
          ok: true,
          count: products.length,
          products: products.map(({ id, title, featuredImageUrl }) => ({
            id,
            title,
            featuredImageUrl,
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
  displayName: "搜索商品列表",
  category: "商品目录",
  stage: "monitor",
  description: "按标题关键词搜索店铺商品，返回 ID、标题与封面图",
  systemPromptExtension:
    "当用户提到某类商品但未给出商品 ID，或要求列出、查找商品时，先调用工具 search_products 获取商品列表，再根据用户意图决定后续操作。若用户描述模糊，可询问更具体的关键词。",
  createTool: (context) => createSearchProductsTool(context),
};
