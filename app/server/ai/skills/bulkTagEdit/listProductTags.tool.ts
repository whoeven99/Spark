import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentContext } from "../../core/toolRegistry.server";
import { listShopifyProducts } from "../../../shopify/shopifyObjectList.server";
import { fetchProductTagsByProductIds } from "../../../shopify/productTagsReader.server";

export const LIST_PRODUCT_TAGS_TOOL_NAME = "list_product_tags";
const LOG_PREFIX = "[ListProductTags]";

/** 单次只读上限：足够让 AI 描述现状，又不会把整店标签塞进上下文。 */
const MAX_PRODUCTS = 50;

export function createListProductTagsTool(context: AgentContext): DynamicStructuredTool {
  const { admin } = context;
  return new DynamicStructuredTool({
    name: LIST_PRODUCT_TAGS_TOOL_NAME,
    description:
      "只读查询商品当前的标签，并汇总这批商品用过哪些标签。用于回答「这些商品都有什么标签」「哪些商品带 sale 标签」，以及在改标签前确认现状。不会修改任何商品。",
    schema: z.object({
      keyword: z.string().optional().describe("商品标题关键词；留空则取最近更新的商品"),
      productIds: z
        .array(z.string())
        .optional()
        .describe("商品 GID 列表（gid://shopify/Product/...），优先于 keyword"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_PRODUCTS)
        .optional()
        .describe(`最多查询多少个商品，默认 20，上限 ${MAX_PRODUCTS}`),
    }),
    func: async ({ keyword, productIds, limit }) => {
      const requestId = crypto.randomUUID();
      try {
        let resolvedIds: string[];
        if (productIds && productIds.length > 0) {
          resolvedIds = productIds
            .map((id: string) => id.trim())
            .filter(Boolean)
            .slice(0, MAX_PRODUCTS);
        } else {
          const list = await listShopifyProducts(admin, {
            keyword: keyword ?? "",
            statusFilter: "all",
            sort: "updated_desc",
            after: null,
            first: Math.min(limit ?? 20, MAX_PRODUCTS),
          });
          resolvedIds = list.items.map((item) => item.id);
        }

        if (resolvedIds.length === 0) {
          return JSON.stringify({ ok: true, productCount: 0, products: [], allTags: [] });
        }

        const { products, truncated } = await fetchProductTagsByProductIds(admin, resolvedIds, {
          maxProducts: MAX_PRODUCTS,
        });

        // 汇总标签及出现次数，方便 AI 直接回答「哪些标签用得最多」
        const tagCounts = new Map<string, { tag: string; count: number }>();
        for (const product of products) {
          for (const tag of product.tags) {
            const key = tag.trim().toLowerCase();
            if (!key) continue;
            const existing = tagCounts.get(key);
            if (existing) existing.count += 1;
            else tagCounts.set(key, { tag: tag.trim(), count: 1 });
          }
        }

        console.info(
          `${LOG_PREFIX} done requestId=${requestId} products=${products.length} tags=${tagCounts.size}`,
        );
        return JSON.stringify({
          ok: true,
          productCount: products.length,
          truncated,
          products: products.map((product) => ({
            productId: product.productId,
            productTitle: product.productTitle,
            tags: product.tags,
          })),
          allTags: Array.from(tagCounts.values()).sort((a, b) => b.count - a.count),
        });
      } catch (e) {
        console.error(`${LOG_PREFIX} failed requestId=${requestId}`, e);
        return JSON.stringify({
          ok: false,
          errorMsg: e instanceof Error ? e.message : String(e),
        });
      }
    },
  });
}
