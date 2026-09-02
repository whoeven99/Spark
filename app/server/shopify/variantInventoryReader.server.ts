/**
 * 按 SKU 批量读取变体在**指定地点**的可售库存（库存导入的读侧）。
 *
 * 与 `variantCostReader.server.ts` 的区别：那边读的是挂在 InventoryItem 上的
 * 单位成本（与地点无关），这边要读 `inventoryItem.inventoryLevel(locationId:)`——
 * 库存量是「库存项 × 地点」的交叉数据，换个地点就是另一个数。
 *
 * `inventoryLevel` 为 null 表示这个变体没有在该地点备货（没有 InventoryLevel 记录），
 * 这里如实返回 null，由 `computeBulkInventoryImportRows` 判为 `not_stocked_at_location`。
 *
 * 需要 read_inventory scope。本文件只读，不含任何 mutation。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import type { BulkInventoryImportVariant } from "../../lib/bulkInventoryImport";

const VARIANTS_INVENTORY_BY_SKU_QUERY = `#graphql
  query BulkInventoryImportVariants(
    $first: Int!
    $after: String
    $query: String!
    $locationId: ID!
  ) {
    productVariants(first: $first, after: $after, query: $query) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          sku
          product { id title }
          inventoryItem {
            id
            tracked
            inventoryLevel(locationId: $locationId) {
              id
              quantities(names: ["available"]) {
                name
                quantity
              }
            }
          }
        }
      }
    }
  }
`;

type VariantNode = {
  id: string;
  title?: string | null;
  sku?: string | null;
  product?: { id: string; title?: string | null } | null;
  inventoryItem?: {
    id?: string | null;
    tracked?: boolean | null;
    inventoryLevel?: {
      id?: string | null;
      quantities?: Array<{ name?: string | null; quantity?: number | null }> | null;
    } | null;
  } | null;
};

type VariantsPage = {
  productVariants?: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: Array<{ node: VariantNode }>;
  };
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

function readAvailable(node: VariantNode): number | null {
  const level = node.inventoryItem?.inventoryLevel;
  if (!level) return null;
  const entry = level.quantities?.find((q) => q?.name === "available");
  return typeof entry?.quantity === "number" ? entry.quantity : null;
}

function mapNode(node: VariantNode): BulkInventoryImportVariant | null {
  const productId = node.product?.id?.trim();
  if (!productId) return null;
  return {
    variantId: node.id,
    productId,
    productTitle: node.product?.title?.trim() || productId,
    variantTitle: node.title?.trim() || "",
    sku: node.sku?.trim() || null,
    inventoryItemId: node.inventoryItem?.id?.trim() || null,
    tracked: node.inventoryItem?.tracked === true,
    availableAtLocation: readAvailable(node),
  };
}

/**
 * 按 SKU 列表批量读取变体在某地点的可售量。
 * 查不到的 SKU 不会出现在结果里，由调用方对比后报「未匹配」。
 */
export async function fetchVariantInventoryBySkus(
  admin: ShopifyAdminGraphqlClient,
  skus: string[],
  locationId: string,
): Promise<BulkInventoryImportVariant[]> {
  const unique = Array.from(new Set(skus.map((s) => s.trim()).filter(Boolean)));
  if (unique.length === 0) return [];

  const collected: BulkInventoryImportVariant[] = [];

  for (const group of chunk(unique, SKUS_PER_QUERY)) {
    const query = group.map((sku) => `sku:"${escapeSearchValue(sku)}"`).join(" OR ");
    let after: string | null = null;

    for (;;) {
      const response = await admin.graphql(VARIANTS_INVENTORY_BY_SKU_QUERY, {
        variables: { first: PAGE_SIZE, after, query, locationId },
      });
      if (!response.ok) {
        throw new Error(`Shopify productVariants query failed: HTTP ${response.status}`);
      }
      const json = (await response.json()) as {
        data?: VariantsPage;
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
