import type { ShopifyAdminGraphqlClient } from "../ai/tools/implementations/shopifyShopInfoTool";
import { logDetailedError } from "../generateDescription/generateDescriptionLog.server";
import type { ProductSearchItem } from "../../lib/productSearchTypes";

const LOG_PREFIX = "[ProductSearch]";

const PRODUCT_SEARCH_QUERY = `#graphql
  query ProductSearchByTitle($first: Int!, $query: String!) {
    products(first: $first, query: $query) {
      edges {
        node {
          id
          title
          featuredImage {
            url
          }
        }
      }
    }
  }
`;

type ProductSearchQueryResponse = {
  data?: {
    products?: {
      edges?: Array<{
        node?: {
          id?: string;
          title?: string | null;
          featuredImage?: { url?: string | null } | null;
        };
      }>;
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

/**
 * 将用户输入转为 Shopify Admin `products(query: …)` 中标题子串匹配表达式（`title:*keyword*`）。
 * 对反斜杠与双引号做转义，降低注入与语法破坏风险。
 */
export function buildProductTitleSearchQuery(keyword: string): string {
  const t = keyword.trim();
  if (!t) return "";
  const escaped = t.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `title:*${escaped}*`;
}

/**
 * 按标题关键词搜索商品（Admin GraphQL），供已鉴权的 API / 服务端逻辑调用。
 */
export async function searchProducts(
  admin: ShopifyAdminGraphqlClient,
  keyword: string,
  options?: { first?: number },
): Promise<ProductSearchItem[]> {
  const q = buildProductTitleSearchQuery(keyword);
  if (!q) return [];

  const first = Math.min(Math.max(options?.first ?? 20, 1), 50);

  try {
    const response = await admin.graphql(PRODUCT_SEARCH_QUERY, {
      variables: { first, query: q },
    });
    const payload = (await response.json()) as ProductSearchQueryResponse;

    if (!response.ok) {
      throw new Error(`Shopify HTTP ${response.status}`);
    }
    const gqlErrors = payload.errors?.map((e) => e.message).filter(Boolean);
    if (gqlErrors?.length) {
      throw new Error(gqlErrors.join("；"));
    }

    const edges = payload.data?.products?.edges ?? [];
    const out: ProductSearchItem[] = [];
    for (const edge of edges) {
      const node = edge?.node;
      const id = node?.id?.trim();
      if (!id) continue;
      const title = (node?.title ?? "").trim() || "未命名商品";
      const url = node?.featuredImage?.url?.trim();
      out.push({
        id,
        title,
        featuredImageUrl: url ? url : null,
      });
    }
    return out;
  } catch (e) {
    logDetailedError(LOG_PREFIX, "searchProducts failed", e);
    throw e instanceof Error ? e : new Error("商品搜索失败");
  }
}
