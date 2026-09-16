/**
 * 可售库存规则写回：set/clear 走 inventorySetQuantities(available)，增减走 adjust。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import {
  INVENTORY_QTY_MUTATION_BATCH,
  coerceInventoryQtyEditRows,
  type InventoryQtyEditApplyOutcome,
  type InventoryQtyMode,
} from "../../lib/inventoryQtyEdit";
import {
  adjustInventoryQuantities,
  setInventoryQuantities,
} from "../shopify/inventoryQuantities.server";

export async function applyInventoryQtyEdit(args: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  taskId: string;
  mode: InventoryQtyMode;
  rows: unknown;
}): Promise<InventoryQtyEditApplyOutcome> {
  const writable = coerceInventoryQtyEditRows(args.rows).filter((row) => !row.skipped);
  const uri = `spark://ai-task/${args.taskId}`;
  const outcome =
    args.mode === "adjust"
      ? await adjustInventoryQuantities({
          admin: args.admin,
          referenceDocumentUri: uri,
          items: writable.map((row) => ({
            inventoryItemId: row.inventoryItemId,
            locationId: row.locationId,
            delta: row.afterAvailable - row.beforeAvailable,
            compareQuantity: row.beforeAvailable,
          })),
          batchSize: INVENTORY_QTY_MUTATION_BATCH,
        })
      : await setInventoryQuantities({
          admin: args.admin,
          name: "available",
          referenceDocumentUri: uri,
          items: writable.map((row) => ({
            inventoryItemId: row.inventoryItemId,
            locationId: row.locationId,
            quantity: row.afterAvailable,
            compareQuantity: row.beforeAvailable,
          })),
          batchSize: INVENTORY_QTY_MUTATION_BATCH,
        });
  console.info(
    `[InventoryQtyEdit][Apply] shop=${args.shop} mode=${args.mode} succeeded=${outcome.succeeded} failed=${outcome.errors.length}`,
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
