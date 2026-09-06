import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentContext } from "../../core/toolRegistry.server";
import { listShopifyProducts } from "../../../shopify/shopifyObjectList.server";
import { fetchProductStatusByProductIds } from "../../../shopify/productStatusReader.server";

export const LIST_PRODUCT_STATUS_TOOL_NAME = "list_product_status";
const LOG_PREFIX = "[ListProductStatus]";

/** 单次只读上限：足够让 AI 描述现状，又不会把整店商品塞进上下文。 */
const MAX_PRODUCTS = 50;

export function createListProductStatusTool(context: AgentContext): DynamicStructuredTool {
  const { admin } = context;
  return new DynamicStructuredTool({
    name: LIST_PRODUCT_STATUS_TOOL_NAME,
    description:
      "只读查询商品当前的上下架状态（Active / Draft / Archived），并附带库存数量与是否发布到 Online Store。用于回答「哪些商品还是草稿」「这批商品上架了吗」，以及在批量上下架前确认现状。不会修改任何商品。",
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
          return JSON.stringify({ ok: true, productCount: 0, products: [], statusCounts: {} });
        }

        const { products, truncated } = await fetchProductStatusByProductIds(admin, resolvedIds, {
          maxProducts: MAX_PRODUCTS,
        });

        // 按状态汇总，方便 AI 直接回答「有多少个还是草稿」
        const statusCounts: Record<string, number> = {};
        for (const product of products) {
          const key = product.status || "UNKNOWN";
          statusCounts[key] = (statusCounts[key] ?? 0) + 1;
        }

        console.info(
          `${LOG_PREFIX} done requestId=${requestId} products=${products.length}`,
        );
        return JSON.stringify({
          ok: true,
          productCount: products.length,
          truncated,
          products: products.map((product) => ({
            productId: product.productId,
            productTitle: product.productTitle,
            status: product.status,
            totalInventory: product.totalInventory,
            tracksInventory: product.tracksInventory,
            publishedToOnlineStore: Boolean(product.publishedAt),
          })),
          statusCounts,
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
