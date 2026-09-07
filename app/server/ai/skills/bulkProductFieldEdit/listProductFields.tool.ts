import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentContext } from "../../core/toolRegistry.server";
import { listShopifyProducts } from "../../../shopify/shopifyObjectList.server";
import { fetchProductFieldsByProductIds } from "../../../shopify/productFieldReader.server";

export const LIST_PRODUCT_FIELDS_TOOL_NAME = "list_product_fields";
const MAX_PRODUCTS = 50;

export function createListProductFieldsTool(context: AgentContext): DynamicStructuredTool {
  const { admin } = context;
  return new DynamicStructuredTool({
    name: LIST_PRODUCT_FIELDS_TOOL_NAME,
    description:
      "只读查询商品当前的 Vendor、商品类型、SEO 标题与 SEO 描述。用于回答「这批商品品牌是什么」「哪些还没写 SEO」。不会修改任何商品。",
    schema: z.object({
      keyword: z.string().optional(),
      productIds: z.array(z.string()).optional(),
      limit: z.number().int().min(1).max(MAX_PRODUCTS).optional(),
    }),
    func: async ({ keyword, productIds, limit }) => {
      try {
        let resolvedIds: string[];
        if (productIds && productIds.length > 0) {
          resolvedIds = productIds.map((id: string) => id.trim()).filter(Boolean).slice(0, MAX_PRODUCTS);
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
          return JSON.stringify({ ok: true, productCount: 0, products: [] });
        }
        const { products, truncated } = await fetchProductFieldsByProductIds(admin, resolvedIds, {
          maxProducts: MAX_PRODUCTS,
        });
        return JSON.stringify({ ok: true, productCount: products.length, truncated, products });
      } catch (error) {
        return JSON.stringify({
          ok: false,
          errorMsg: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });
}
