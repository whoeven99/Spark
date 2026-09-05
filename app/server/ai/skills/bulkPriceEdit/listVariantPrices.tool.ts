import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentContext } from "../../core/toolRegistry.server";
import { listShopifyProducts } from "../../../shopify/shopifyObjectList.server";
import { fetchVariantPricesByProductIds } from "../../../shopify/variantPriceReader.server";
import {
  computeVariantPriceChange,
  parseBulkPriceEditRule,
  BulkPriceEditRuleError,
} from "../../../../lib/bulkPriceEdit";

export const LIST_VARIANT_PRICES_TOOL_NAME = "list_variant_prices";
const LOG_PREFIX = "[ListVariantPrices]";

/** 单次只读上限：足够让 AI 描述现状，又不会把整店变体塞进上下文。 */
const MAX_PRODUCTS = 20;
const MAX_VARIANTS = 100;

export function createListVariantPricesTool(context: AgentContext): DynamicStructuredTool {
  const { admin } = context;
  return new DynamicStructuredTool({
    name: LIST_VARIANT_PRICES_TOOL_NAME,
    description:
      "只读查询商品变体的当前价格与划线价，可选传入调价规则做「试算」（返回每个变体的新价，但不会修改店铺）。用于回答「这批商品现在多少钱」「降价 10% 后是多少」。",
    schema: z.object({
      keyword: z
        .string()
        .optional()
        .describe("商品标题关键词；留空则取最近更新的商品"),
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
        .describe(`最多查询多少个商品，默认 10，上限 ${MAX_PRODUCTS}`),
      priceMode: z
        .enum(["percent_down", "percent_up", "amount_down", "amount_up", "set_fixed"])
        .optional()
        .describe("可选试算规则：调价方式。不传则只返回当前价格"),
      priceValue: z
        .number()
        .optional()
        .describe("试算数值：percent_* 为百分数（10 = 10%），amount_* / set_fixed 为金额"),
      rounding: z
        .enum(["none", "end99", "end95", "integer"])
        .optional()
        .describe("试算取整方式，默认 none"),
    }),
    func: async ({ keyword, productIds, limit, priceMode, priceValue, rounding }) => {
      const requestId = crypto.randomUUID();
      try {
        let resolvedProducts: Array<{ id: string; title: string }>;
        if (productIds && productIds.length > 0) {
          resolvedProducts = productIds
            .map((id: string) => id.trim())
            .filter(Boolean)
            .slice(0, MAX_PRODUCTS)
            .map((id: string) => ({ id, title: id }));
        } else {
          const list = await listShopifyProducts(admin, {
            keyword: keyword ?? "",
            statusFilter: "all",
            sort: "updated_desc",
            after: null,
            first: Math.min(limit ?? 10, MAX_PRODUCTS),
          });
          resolvedProducts = list.items.map((item) => ({ id: item.id, title: item.title }));
        }

        if (resolvedProducts.length === 0) {
          return JSON.stringify({ ok: true, productCount: 0, variantCount: 0, variants: [] });
        }

        const { variants, truncated } = await fetchVariantPricesByProductIds(
          admin,
          resolvedProducts.map((p) => p.id),
          { maxVariants: MAX_VARIANTS },
        );

        // 有规则时做试算；规则非法直接把原因回给模型，让它改参数重试
        let preview: Array<{ variantId: string; afterPrice: string; skipReason?: string }> | null =
          null;
        if (priceMode) {
          try {
            const rule = parseBulkPriceEditRule({
              priceMode,
              priceValue: priceValue != null ? String(priceValue) : "",
              rounding: rounding ?? "none",
              compareAtMode: "unchanged",
              minPrice: "",
            });
            preview = variants.map((variant) => {
              const row = computeVariantPriceChange(variant, rule);
              return {
                variantId: row.variantId,
                afterPrice: row.afterPrice,
                ...(row.skipReason ? { skipReason: row.skipReason } : {}),
              };
            });
          } catch (e) {
            if (e instanceof BulkPriceEditRuleError) {
              return JSON.stringify({ ok: false, errorMsg: e.message });
            }
            throw e;
          }
        }

        const previewById = new Map((preview ?? []).map((p) => [p.variantId, p]));
        console.info(
          `${LOG_PREFIX} done requestId=${requestId} products=${resolvedProducts.length} variants=${variants.length}`,
        );
        return JSON.stringify({
          ok: true,
          productCount: new Set(variants.map((v) => v.productId)).size,
          variantCount: variants.length,
          truncated,
          variants: variants.map((variant) => {
            const p = previewById.get(variant.variantId);
            return {
              variantId: variant.variantId,
              productId: variant.productId,
              productTitle: variant.productTitle,
              variantTitle: variant.variantTitle,
              sku: variant.sku,
              price: variant.price,
              compareAtPrice: variant.compareAtPrice,
              ...(p ? { previewPrice: p.afterPrice, previewSkipReason: p.skipReason } : {}),
            };
          }),
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
