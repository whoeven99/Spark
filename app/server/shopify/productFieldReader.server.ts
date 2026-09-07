/**
 * 商品标量字段只读读取（vendor / productType / SEO）。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import type { BulkProductFieldEditProductInput } from "../../lib/bulkProductFieldEdit";
import { fetchProductConnectionByIds } from "./productIdQuery.server";

const QUERY = `#graphql
  query BulkProductFieldEditProducts($first: Int!, $after: String, $query: String!) {
    products(first: $first, after: $after, query: $query) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          vendor
          productType
          seo { title description }
        }
      }
    }
  }
`;

type Node = {
  id?: string | null;
  title?: string | null;
  vendor?: string | null;
  productType?: string | null;
  seo?: { title?: string | null; description?: string | null } | null;
};

function mapNode(node: Node): BulkProductFieldEditProductInput | null {
  const productId = node.id?.trim();
  if (!productId) return null;
  return {
    productId,
    productTitle: node.title?.trim() || productId,
    vendor: node.vendor?.trim() ?? "",
    productType: node.productType?.trim() ?? "",
    seoTitle: node.seo?.title?.trim() ?? "",
    seoDescription: node.seo?.description?.trim() ?? "",
  };
}

export async function fetchProductFieldsByProductIds(
  admin: ShopifyAdminGraphqlClient,
  productIds: string[],
  options: { maxProducts: number },
): Promise<{ products: BulkProductFieldEditProductInput[]; truncated: boolean }> {
  const { items, truncated } = await fetchProductConnectionByIds(admin, productIds, {
    query: QUERY,
    maxProducts: options.maxProducts,
    mapNode,
  });
  return { products: items, truncated };
}
