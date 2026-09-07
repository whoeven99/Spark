/**
 * 批量归档写回 —— 只把 status 写成 ARCHIVED。与上下架 apply 分开，避免破坏 ACTIVE/DRAFT 白名单。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import type { BulkArchiveApplyOutcome, BulkArchiveRow } from "../../lib/bulkArchive";
import { mapWithConcurrency } from "../shopify/productIdQuery.server";

const LOG_PREFIX = "[BulkArchive][Apply]";
const MUTATION_CONCURRENCY = 2;

const PRODUCT_UPDATE = `#graphql
  mutation BulkArchiveUpdate($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id status }
      userErrors { field message }
    }
  }
`;

export function buildBulkArchiveWritableRows(rows: BulkArchiveRow[]): BulkArchiveRow[] {
  return rows.filter((row) => !row.skipped && row.afterStatus === "ARCHIVED");
}

async function applyRow(
  admin: ShopifyAdminGraphqlClient,
  row: BulkArchiveRow,
): Promise<{ productId: string; message: string } | null> {
  try {
    const response = await admin.graphql(PRODUCT_UPDATE, {
      variables: { product: { id: row.productId, status: "ARCHIVED" } },
    });
    if (!response.ok) return { productId: row.productId, message: `HTTP ${response.status}` };
    const json = (await response.json()) as {
      data?: {
        productUpdate?: { userErrors?: Array<{ message: string }> | null };
      };
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

export async function applyBulkArchive(args: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  rows: BulkArchiveRow[];
}): Promise<BulkArchiveApplyOutcome> {
  const writableRows = buildBulkArchiveWritableRows(args.rows);
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
