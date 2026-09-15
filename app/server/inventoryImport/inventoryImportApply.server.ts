/**
 * 库存导入写回 —— 只改 on_hand，带 compareQuantity。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import { INVENTORY_QTY_PER_MUTATION } from "../../lib/inventoryQtyEdit";
import type { InventoryImportRow } from "../../lib/inventoryCsv";
import type { InventoryQtyApplyOutcome } from "../../lib/inventoryQtyEdit";
import { chunkItems, mapWithConcurrency } from "../shopify/productIdQuery.server";
import { executeInventorySetQuantities } from "../shopify/inventoryQuantities.server";

const LOG_PREFIX = "[InventoryImport][Apply]";
const MUTATION_CONCURRENCY = 2;

export async function applyInventoryImport(args: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  taskId: string;
  rows: InventoryImportRow[];
}): Promise<InventoryQtyApplyOutcome> {
  const writable = args.rows.filter((row) => !row.skipped);
  const batches = chunkItems(writable, INVENTORY_QTY_PER_MUTATION);
  const referenceDocumentUri = `https://spark.app/ai-tasks/${args.taskId}`;
  const outcomes = await mapWithConcurrency(batches, MUTATION_CONCURRENCY, (batch) =>
    executeInventorySetQuantities(args.admin, {
      name: "on_hand",
      referenceDocumentUri,
      quantities: batch.map((row) => ({
        inventoryItemId: row.inventoryItemId,
        locationId: row.locationId,
        quantity: row.onHandAfter,
        compareQuantity: row.onHandBefore,
      })),
    }),
  );
  let succeeded = 0;
  const errors: Array<{ variantId: string; message: string }> = [];
  outcomes.forEach((outcome, index) => {
    const batch = batches[index] ?? [];
    if (outcome.error) {
      for (const row of batch) errors.push({ variantId: row.variantId, message: outcome.error ?? "" });
      return;
    }
    succeeded += batch.length;
  });
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
