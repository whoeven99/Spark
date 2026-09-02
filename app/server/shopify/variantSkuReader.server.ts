/**
 * 按 SKU 批量读取变体（价目表导入的读侧）。
 *
 * 与 `variantPriceReader.server.ts` 的区别：那边按 product_ids 拉（用户先选商品），
 * 这边按 SKU 拉（商品由上传的表格决定）。本文件只读，不含任何 mutation。
 *
 * 注意 Shopify 不强制 SKU 唯一，同一个 SKU 可能返回多个变体。
 * 这里如实全部返回，冲突判定交给 `computeBulkPriceImportRows`。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import type { BulkPriceImportVariant } from "../../lib/bulkPriceImport";

const VARIANTS_BY_SKU_QUERY = `#graphql
  query BulkPriceImportVariants($first: Int!, $after: String, $query: String!) {
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

type VariantNode = {
  id: string;
  title?: string | null;
  sku?: string | null;
  price?: string | null;
  compareAtPrice?: string | null;
  product?: { id: string; title?: string | null } | null;
};

const PAGE_SIZE = 100;
/** 一次 query 串里塞的 SKU 数；SKU 是任意字符串，塞太多会让查询串超长。 */
const SKUS_PER_QUERY = 20;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Shopify 搜索语法里双引号和反斜杠需要转义，否则含空格的 SKU 会把查询串拆坏。 */
function escapeSearchValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function mapNode(node: VariantNode): BulkPriceImportVariant | null {
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
 * 按 SKU 列表批量读取变体。
 * 查不到的 SKU 不会出现在结果里，由调用方对比后报「未匹配」。
 */
export async function fetchVariantsBySkus(
  admin: ShopifyAdminGraphqlClient,
  skus: string[],
): Promise<BulkPriceImportVariant[]> {
  const unique = Array.from(new Set(skus.map((s) => s.trim()).filter(Boolean)));
  if (unique.length === 0) return [];

  const collected: BulkPriceImportVariant[] = [];

  for (const group of chunk(unique, SKUS_PER_QUERY)) {
    const query = group.map((sku) => `sku:"${escapeSearchValue(sku)}"`).join(" OR ");
    let after: string | null = null;

    for (;;) {
      const response = await admin.graphql(VARIANTS_BY_SKU_QUERY, {
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
        const mapped = mapNode(edge.node);
        if (mapped) collected.push(mapped);
      }
      if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break;
      after = connection.pageInfo.endCursor;
    }
  }

  return collected;
}
