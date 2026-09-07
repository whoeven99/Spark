/**
 * 复制商品只读读取：标题与当前状态。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import type { ProductDuplicateProductInput } from "../../lib/productDuplicate";
import { fetchProductConnectionByIds } from "./productIdQuery.server";

const QUERY = `#graphql
  query ProductDuplicateProducts($first: Int!, $after: String, $query: String!) {
    products(first: $first, after: $after, query: $query) {
      pageInfo { hasNextPage endCursor }
      edges {
        node { id title status }
      }
    }
  }
`;

export async function fetchProductsForDuplicate(
  admin: ShopifyAdminGraphqlClient,
  productIds: string[],
  options: { maxProducts: number },
): Promise<{ products: ProductDuplicateProductInput[]; truncated: boolean }> {
  const { items, truncated } = await fetchProductConnectionByIds(admin, productIds, {
    query: QUERY,
    maxProducts: options.maxProducts,
    mapNode: (node: { id?: string | null; title?: string | null; status?: string | null }) => {
      const productId = node.id?.trim();
      if (!productId) return null;
      return {
        productId,
        productTitle: node.title?.trim() || productId,
        status: node.status?.trim() ?? "",
      };
    },
  });
  return { products: items, truncated };
}
