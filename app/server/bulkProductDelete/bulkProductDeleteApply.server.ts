/**
 * 批量删除商品写回 —— 全仓库唯一 productDelete 调用处。不可恢复。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import type { BulkProductDeleteApplyOutcome, BulkProductDeleteRow } from "../../lib/bulkProductDelete";
import { mapWithConcurrency } from "../shopify/productIdQuery.server";

const LOG_PREFIX = "[BulkProductDelete][Apply]";
const MUTATION_CONCURRENCY = 2;

const PRODUCT_DELETE = `#graphql
  mutation BulkProductDelete($input: ProductDeleteInput!) {
    productDelete(input: $input) {
      deletedProductId
      userErrors { field message }
    }
  }
`;

export function buildBulkProductDeleteWritableRows(rows: BulkProductDeleteRow[]): BulkProductDeleteRow[] {
  return rows.filter((row) => !row.skipped);
}

async function applyRow(
  admin: ShopifyAdminGraphqlClient,
  row: BulkProductDeleteRow,
): Promise<{ productId: string; message: string } | null> {
  try {
    const response = await admin.graphql(PRODUCT_DELETE, {
      variables: { input: { id: row.productId } },
    });
    if (!response.ok) return { productId: row.productId, message: `HTTP ${response.status}` };
    const json = (await response.json()) as {
      data?: {
        productDelete?: {
          deletedProductId?: string | null;
          userErrors?: Array<{ message: string }> | null;
        };
      };
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) {
      return { productId: row.productId, message: json.errors.map((error) => error.message).join("; ") };
    }
    const userErrors = json.data?.productDelete?.userErrors ?? [];
    if (userErrors.length > 0) {
      return { productId: row.productId, message: userErrors.map((error) => error.message).join("; ") };
    }
    if (!json.data?.productDelete?.deletedProductId) {
      return { productId: row.productId, message: "product not deleted" };
    }
    return null;
  } catch (error) {
    return { productId: row.productId, message: error instanceof Error ? error.message : String(error) };
  }
}

export async function applyBulkProductDelete(args: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  rows: BulkProductDeleteRow[];
}): Promise<BulkProductDeleteApplyOutcome> {
  const writableRows = buildBulkProductDeleteWritableRows(args.rows);
  const outcomes = await mapWithConcurrency(writableRows, MUTATION_CONCURRENCY, (row) =>
    applyRow(args.admin, row),
  );
  const errors = outcomes.filter(
    (item): item is { productId: string; message: string } => item !== null,
  );
  const succeeded = writableRows.length - errors.length;
  console.info(
    `${LOG_PREFIX} shop=${args.shop} products=${writableRows.length} succeeded=${succeeded} failed=${errors.length}`,
  );
  return {
    at: new Date().toISOString(),
    succeeded,
    failed: errors.length,
    errors: errors.slice(0, 50),
  };
}
