/**
 * 批量改单位成本写回 —— 只传 inventoryItem.cost，不改价格。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import {
  BULK_COST_EDIT_VARIANTS_PER_MUTATION,
  type BulkCostEditApplyOutcome,
  type BulkCostEditRow,
} from "../../lib/bulkCostEdit";
import { mapWithConcurrency } from "../shopify/productIdQuery.server";
import { executeProductVariantsBulkUpdate } from "../shopify/productVariantsBulkUpdate.server";

const LOG_PREFIX = "[BulkCostEdit][Apply]";
const MUTATION_CONCURRENCY = 2;

type CostBatch = {
  productId: string;
  variants: Array<{ id: string; inventoryItem: { cost: string } }>;
  rows: BulkCostEditRow[];
};

export function buildBulkCostEditBatches(rows: BulkCostEditRow[]): CostBatch[] {
  const byProduct = new Map<string, BulkCostEditRow[]>();
  for (const row of rows) {
    if (row.skipped || !row.inventoryItemId || !row.afterCost) continue;
    const list = byProduct.get(row.productId);
    if (list) list.push(row);
    else byProduct.set(row.productId, [row]);
  }
  const batches: CostBatch[] = [];
  for (const [productId, productRows] of byProduct) {
    for (let i = 0; i < productRows.length; i += BULK_COST_EDIT_VARIANTS_PER_MUTATION) {
      const slice = productRows.slice(i, i + BULK_COST_EDIT_VARIANTS_PER_MUTATION);
      batches.push({
        productId,
        variants: slice.map((row) => ({ id: row.variantId, inventoryItem: { cost: row.afterCost } })),
        rows: slice,
      });
    }
  }
  return batches;
}

async function runBatch(
  admin: ShopifyAdminGraphqlClient,
  batch: CostBatch,
): Promise<{ succeeded: number; errors: Array<{ variantId: string; message: string }> }> {
  const failAll = (message: string) => ({
    succeeded: 0,
    errors: batch.rows.map((row) => ({ variantId: row.variantId, message })),
  });
  const outcome = await executeProductVariantsBulkUpdate(admin, batch.productId, batch.variants);
  if (outcome.error) return failAll(outcome.error);
  const errors: Array<{ variantId: string; message: string }> = [];
  let succeeded = 0;
  for (const row of batch.rows) {
    if (outcome.updatedIds.size === 0 || outcome.updatedIds.has(row.variantId)) succeeded += 1;
    else errors.push({ variantId: row.variantId, message: "variant not returned by Shopify" });
  }
  return { succeeded, errors };
}

export async function applyBulkCostEdit(args: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  rows: BulkCostEditRow[];
}): Promise<BulkCostEditApplyOutcome> {
  const batches = buildBulkCostEditBatches(args.rows);
  const outcomes = await mapWithConcurrency(batches, MUTATION_CONCURRENCY, (batch) =>
    runBatch(args.admin, batch),
  );
  let succeeded = 0;
  const errors: Array<{ variantId: string; message: string }> = [];
  for (const outcome of outcomes) {
    succeeded += outcome.succeeded;
    errors.push(...outcome.errors);
  }
  console.info(
    `${LOG_PREFIX} shop=${args.shop} batches=${batches.length} succeeded=${succeeded} failed=${errors.length}`,
  );
  return {
    at: new Date().toISOString(),
    succeeded,
    failed: errors.length,
    errors: errors.slice(0, 50),
  };
}
