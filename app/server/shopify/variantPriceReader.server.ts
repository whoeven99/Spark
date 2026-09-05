/**
 * 变体价格只读读取（批量调价的读侧）。
 *
 * 走 `productVariants` 根查询 + `product_ids:` 过滤，而不是 products→variants 嵌套：
 * 嵌套写法在「多商品 × 多变体」时查询成本会成倍上涨，根查询按变体分页更稳。
 * 本文件只读，不含任何 mutation。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";

const VARIANT_PRICES_QUERY = `#graphql
  query BulkPriceEditVariants($first: Int!, $after: String, $query: String!) {
    productVariants(first: $first, after: $after, query: $query) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          sku
          price
          compareAtPrice
          product { id title }
        }
      }
    }
  }
`;

export type ShopifyVariantPrice = {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  price: string | null;
  compareAtPrice: string | null;
};

type VariantNode = {
  id: string;
  title?: string | null;
  sku?: string | null;
  price?: string | null;
  compareAtPrice?: string | null;
  product?: { id: string; title?: string | null } | null;
};

const PAGE_SIZE = 100;
/** 一次 product_ids 过滤里塞的商品数；过大会让查询串超长。 */
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

function mapNode(node: VariantNode): ShopifyVariantPrice | null {
  const productId = node.product?.id?.trim();
  if (!productId) return null;
  return {
    variantId: node.id,
    productId,
    productTitle: node.product?.title?.trim() || productId,
    variantTitle: node.title?.trim() || "",
    sku: node.sku?.trim() || null,
    price: node.price ?? null,
    compareAtPrice: node.compareAtPrice ?? null,
  };
}

/**
 * 按商品 GID 批量读取变体价格。
 * 达到 maxVariants 后停止并置 truncated，调用方据此告知用户结果不完整。
 */
export async function fetchVariantPricesByProductIds(
  admin: ShopifyAdminGraphqlClient,
  productIds: string[],
  options: { maxVariants: number },
): Promise<{ variants: ShopifyVariantPrice[]; truncated: boolean }> {
  const numericIds = productIds.map(toNumericId).filter(Boolean);
  if (numericIds.length === 0) return { variants: [], truncated: false };

  const collected: ShopifyVariantPrice[] = [];
  /** 因为撞到上限而提前停止（还有没读到的变体） */
  let truncated = false;

  for (const group of chunk(numericIds, PRODUCT_IDS_PER_QUERY)) {
    if (truncated) break;
    let after: string | null = null;
    const query = `product_ids:${group.join(",")}`;

    while (!truncated) {
      const response = await admin.graphql(VARIANT_PRICES_QUERY, {
        variables: { first: PAGE_SIZE, after, query },
      });
      if (!response.ok) {
        throw new Error(`Shopify productVariants query failed: HTTP ${response.status}`);
      }
      const json = (await response.json()) as {
        data?: {
          productVariants?: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
            edges: Array<{ node: VariantNode }>;
          };
        };
        errors?: Array<{ message: string }>;
      };
      if (json.errors?.length) {
        throw new Error(
          `Shopify productVariants GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`,
        );
      }
      const connection = json.data?.productVariants;
      if (!connection) break;
      for (const edge of connection.edges) {
        if (collected.length >= options.maxVariants) {
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

  return { variants: collected, truncated };
}
