/**
 * 商品 SEO 元数据只读读取（批量 SEO 改写的读侧）。
 *
 * 除了当前 SEO 标题/描述，还要带出 title / vendor / productType ——
 * 它们是模板占位符的取值来源。本文件只读，不含任何 mutation。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";

const PRODUCT_SEO_QUERY = `#graphql
  query BulkSeoEditProducts($first: Int!, $after: String, $query: String!) {
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

export type ShopifyProductSeo = {
  productId: string;
  productTitle: string;
  vendor: string | null;
  productType: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

type ProductNode = {
  id: string;
  title?: string | null;
  vendor?: string | null;
  productType?: string | null;
  seo?: { title?: string | null; description?: string | null } | null;
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

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? null : trimmed;
}

function mapNode(node: ProductNode): ShopifyProductSeo | null {
  const productId = node.id?.trim();
  if (!productId) return null;
  return {
    productId,
    productTitle: node.title?.trim() || productId,
    vendor: emptyToNull(node.vendor),
    productType: emptyToNull(node.productType),
    seoTitle: emptyToNull(node.seo?.title),
    seoDescription: emptyToNull(node.seo?.description),
  };
}

/**
 * 按商品 GID 批量读取 SEO 与模板取值字段。
 * 达到 maxProducts 后停止并置 truncated，调用方据此告知用户结果不完整。
 */
export async function fetchProductSeoByProductIds(
  admin: ShopifyAdminGraphqlClient,
  productIds: string[],
  options: { maxProducts: number },
): Promise<{ products: ShopifyProductSeo[]; truncated: boolean }> {
  const numericIds = productIds.map(toNumericId).filter(Boolean);
  if (numericIds.length === 0) return { products: [], truncated: false };

  const collected: ShopifyProductSeo[] = [];
  /** 因为撞到上限而提前停止（还有没读到的商品） */
  let truncated = false;

  for (const group of chunk(numericIds, PRODUCT_IDS_PER_QUERY)) {
    if (truncated) break;
    let after: string | null = null;
    const query = group.map((id) => `id:${id}`).join(" OR ");

    while (!truncated) {
      const response = await admin.graphql(PRODUCT_SEO_QUERY, {
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
