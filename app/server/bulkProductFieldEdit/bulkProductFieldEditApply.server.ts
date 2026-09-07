/**
 * 批量改商品字段写回 —— 全仓库唯一会改 vendor / productType / SEO 的地方。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import type {
  BulkProductFieldEditApplyOutcome,
  BulkProductFieldEditRow,
} from "../../lib/bulkProductFieldEdit";
import { mapWithConcurrency } from "../shopify/productIdQuery.server";

const LOG_PREFIX = "[BulkProductFieldEdit][Apply]";
const MUTATION_CONCURRENCY = 2;

const PRODUCT_UPDATE = `#graphql
  mutation BulkProductFieldEditUpdate($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id }
      userErrors { field message }
    }
  }
`;

export function buildBulkProductFieldEditWritableRows(
  rows: BulkProductFieldEditRow[],
): BulkProductFieldEditRow[] {
  return rows.filter((row) => !row.skipped && row.afterValue !== row.beforeValue);
}

function toProductInput(row: BulkProductFieldEditRow): Record<string, unknown> {
  if (row.field === "vendor") return { id: row.productId, vendor: row.afterValue };
  if (row.field === "productType") return { id: row.productId, productType: row.afterValue };
  if (row.field === "seoTitle") return { id: row.productId, seo: { title: row.afterValue } };
  return { id: row.productId, seo: { description: row.afterValue } };
}

async function applyRow(
  admin: ShopifyAdminGraphqlClient,
  row: BulkProductFieldEditRow,
): Promise<{ productId: string; message: string } | null> {
  try {
    const response = await admin.graphql(PRODUCT_UPDATE, {
      variables: { product: toProductInput(row) },
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

export async function applyBulkProductFieldEdit(args: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  rows: BulkProductFieldEditRow[];
}): Promise<BulkProductFieldEditApplyOutcome> {
  const writableRows = buildBulkProductFieldEditWritableRows(args.rows);
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
