import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentContext } from "../../core/toolRegistry.server";
import { listShopifyProducts } from "../../../shopify/shopifyObjectList.server";
import { fetchProductSeoByProductIds } from "../../../shopify/productSeoReader.server";
import {
  BULK_SEO_DESCRIPTION_MAX_LENGTH,
  BULK_SEO_TITLE_MAX_LENGTH,
  renderSeoTemplate,
} from "../../../../lib/bulkSeoEdit";

export const LIST_PRODUCT_SEO_TOOL_NAME = "list_product_seo";
const LOG_PREFIX = "[ListProductSeo]";

/** 单次只读上限：足够让 AI 描述现状，又不会把整店 SEO 塞进上下文。 */
const MAX_PRODUCTS = 50;

export function createListProductSeoTool(context: AgentContext): DynamicStructuredTool {
  const { admin } = context;
  return new DynamicStructuredTool({
    name: LIST_PRODUCT_SEO_TOOL_NAME,
    description:
      "只读查询商品当前的 SEO 标题与描述，并统计有多少商品还没写 SEO；可选传入模板做「试算」（返回渲染结果，但不会修改店铺）。用于回答「哪些商品缺 SEO」「按这个模板生成出来长什么样」。",
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
      titleTemplate: z
        .string()
        .optional()
        .describe("可选试算：SEO 标题模板，占位符只能用 {title} {vendor} {productType}"),
      descriptionTemplate: z.string().optional().describe("可选试算：SEO 描述模板，占位符同上"),
    }),
    func: async ({ keyword, productIds, limit, titleTemplate, descriptionTemplate }) => {
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
          return JSON.stringify({ ok: true, productCount: 0, products: [] });
        }

        const { products, truncated } = await fetchProductSeoByProductIds(admin, resolvedIds, {
          maxProducts: MAX_PRODUCTS,
        });

        const missingTitle = products.filter((p) => !p.seoTitle).length;
        const missingDescription = products.filter((p) => !p.seoDescription).length;

        console.info(
          `${LOG_PREFIX} done requestId=${requestId} products=${products.length} missingTitle=${missingTitle}`,
        );
        return JSON.stringify({
          ok: true,
          productCount: products.length,
          truncated,
          missingTitle,
          missingDescription,
          titleMaxLength: BULK_SEO_TITLE_MAX_LENGTH,
          descriptionMaxLength: BULK_SEO_DESCRIPTION_MAX_LENGTH,
          products: products.map((product) => ({
            productId: product.productId,
            productTitle: product.productTitle,
            vendor: product.vendor,
            productType: product.productType,
            seoTitle: product.seoTitle,
            seoDescription: product.seoDescription,
            ...(titleTemplate?.trim()
              ? { previewSeoTitle: renderSeoTemplate(titleTemplate.trim(), product) }
              : {}),
            ...(descriptionTemplate?.trim()
              ? {
                  previewSeoDescription: renderSeoTemplate(descriptionTemplate.trim(), product),
                }
              : {}),
          })),
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
