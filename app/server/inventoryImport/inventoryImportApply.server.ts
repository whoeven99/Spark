/**
 * 库存导入写回：唯一 inventorySetQuantities(name: on_hand) 调用编排。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import {
  INVENTORY_IMPORT_MUTATION_BATCH,
  coerceInventoryImportRows,
  type InventoryImportApplyOutcome,
} from "../../lib/inventoryImport";
import { setInventoryQuantities } from "../shopify/inventoryQuantities.server";

export async function applyInventoryImport(args: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  taskId: string;
  rows: unknown;
}): Promise<InventoryImportApplyOutcome> {
  const writable = coerceInventoryImportRows(args.rows).filter((row) => !row.skipped);
  const outcome = await setInventoryQuantities({
    admin: args.admin,
    name: "on_hand",
    referenceDocumentUri: `spark://ai-task/${args.taskId}`,
    items: writable.map((row) => ({
      inventoryItemId: row.inventoryItemId,
      locationId: row.locationId,
      quantity: row.afterOnHand,
      compareQuantity: row.beforeOnHand,
    })),
    batchSize: INVENTORY_IMPORT_MUTATION_BATCH,
  });
  console.info(
    `[InventoryImport][Apply] shop=${args.shop} succeeded=${outcome.succeeded} failed=${outcome.errors.length}`,
  );
  return {
    at: new Date().toISOString(),
    succeeded: outcome.succeeded,
    failed: outcome.errors.length,
    errors: outcome.errors.map((error) => ({
      variantId: writable.find((row) => row.inventoryItemId === error.inventoryItemId)?.variantId ?? "",
      locationId: error.locationId,
      message: error.message,
    })),
  };
}
