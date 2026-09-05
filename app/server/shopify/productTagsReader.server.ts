/**
 * 商品标签只读读取（批量打标的读侧）。
 *
 * 走 `products` 根查询 + `id:` 过滤，按商品分页；本文件只读，不含任何 mutation。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";

const PRODUCT_TAGS_QUERY = `#graphql
  query BulkTagEditProducts($first: Int!, $after: String, $query: String!) {
    products(first: $first, after: $after, query: $query) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          tags
        }
      }
    }
  }
`;

export type ShopifyProductTags = {
  productId: string;
  productTitle: string;
  tags: string[];
};

type ProductNode = {
  id: string;
  title?: string | null;
  tags?: string[] | null;
};

const PAGE_SIZE = 100;
/** 一次 id 过滤里塞的商品数；过大会让查询串超长。 */
const PRODUCT_IDS_PER_QUERY = 25;

function toNumericId(gid: string): string {
  return gid.trim().replace(/^gid:\/\/shopify\/Product\//, "");
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function mapNode(node: ProductNode): ShopifyProductTags | null {
  const productId = node.id?.trim();
  if (!productId) return null;
  return {
    productId,
    productTitle: node.title?.trim() || productId,
    tags: Array.isArray(node.tags) ? node.tags : [],
  };
}

/**
 * 按商品 GID 批量读取标签。
 * 达到 maxProducts 后停止并置 truncated，调用方据此告知用户结果不完整。
 */
export async function fetchProductTagsByProductIds(
  admin: ShopifyAdminGraphqlClient,
  productIds: string[],
  options: { maxProducts: number },
): Promise<{ products: ShopifyProductTags[]; truncated: boolean }> {
  const numericIds = productIds.map(toNumericId).filter(Boolean);
  if (numericIds.length === 0) return { products: [], truncated: false };

  const collected: ShopifyProductTags[] = [];
  /** 因为撞到上限而提前停止（还有没读到的商品） */
  let truncated = false;

  for (const group of chunk(numericIds, PRODUCT_IDS_PER_QUERY)) {
    if (truncated) break;
    let after: string | null = null;
    const query = group.map((id) => `id:${id}`).join(" OR ");

    while (!truncated) {
      const response = await admin.graphql(PRODUCT_TAGS_QUERY, {
        variables: { first: PAGE_SIZE, after, query },
      });
      if (!response.ok) {
        throw new Error(`Shopify products query failed: HTTP ${response.status}`);
      }
      const json = (await response.json()) as {
        data?: {
          products?: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
            edges: Array<{ node: ProductNode }>;
          };
        };
        errors?: Array<{ message: string }>;
      };
      if (json.errors?.length) {
        throw new Error(
          `Shopify products GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`,
        );
      }
      const connection = json.data?.products;
      if (!connection) break;
      for (const edge of connection.edges) {
        if (collected.length >= options.maxProducts) {
          truncated = true;
          break;
        }
        const mapped = mapNode(edge.node);
        if (mapped) collected.push(mapped);
      }
      if (truncated) break;
      if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break;
      after = connection.pageInfo.endCursor;
    }
  }

  return { products: collected, truncated };
}
