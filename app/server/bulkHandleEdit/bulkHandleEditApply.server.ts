/**
 * 批量改 Handle 写回。redirectNewHandle 固定 true，让 Shopify 建 301。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import type { BulkHandleEditApplyOutcome, BulkHandleEditRow } from "../../lib/bulkHandleEdit";
import { mapWithConcurrency } from "../shopify/productIdQuery.server";

const LOG_PREFIX = "[BulkHandleEdit][Apply]";
const MUTATION_CONCURRENCY = 2;

const PRODUCT_UPDATE = `#graphql
  mutation BulkHandleEditUpdate($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id handle }
      userErrors { field message }
    }
  }
`;

export function buildBulkHandleEditWritableRows(rows: BulkHandleEditRow[]): BulkHandleEditRow[] {
  return rows.filter((row) => !row.skipped && row.afterHandle && row.afterHandle !== row.beforeHandle);
}

async function applyRow(
  admin: ShopifyAdminGraphqlClient,
  row: BulkHandleEditRow,
): Promise<{ productId: string; message: string } | null> {
  try {
    const response = await admin.graphql(PRODUCT_UPDATE, {
      variables: {
        product: { id: row.productId, handle: row.afterHandle, redirectNewHandle: true },
      },
    });
    if (!response.ok) return { productId: row.productId, message: `HTTP ${response.status}` };
    const json = (await response.json()) as {
      data?: { productUpdate?: { userErrors?: Array<{ message: string }> | null } };
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) {
      return { productId: row.productId, message: json.errors.map((error) => error.message).join("; ") };
    }
    const userErrors = json.data?.productUpdate?.userErrors ?? [];
    if (userErrors.length > 0) {
      return { productId: row.productId, message: userErrors.map((error) => error.message).join("; ") };
    }
    return null;
  } catch (error) {
    return { productId: row.productId, message: error instanceof Error ? error.message : String(error) };
  }
}

export async function applyBulkHandleEdit(args: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  rows: BulkHandleEditRow[];
}): Promise<BulkHandleEditApplyOutcome> {
  const writableRows = buildBulkHandleEditWritableRows(args.rows);
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
