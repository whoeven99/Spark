/**
 * 库存规则写回 —— 只改 available。唯一 mutation 出口在 inventoryQuantities.server.ts。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import {
  INVENTORY_QTY_PER_MUTATION,
  type InventoryQtyApplyOutcome,
  type InventoryQtyRow,
} from "../../lib/inventoryQtyEdit";
import { chunkItems, mapWithConcurrency } from "../shopify/productIdQuery.server";
import {
  executeInventoryAdjustQuantities,
  executeInventorySetQuantities,
} from "../shopify/inventoryQuantities.server";

const LOG_PREFIX = "[InventoryQty][Apply]";
const MUTATION_CONCURRENCY = 2;

export async function applyInventoryQtyEdit(args: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  taskId: string;
  mode: "set" | "adjust" | "zero";
  rows: InventoryQtyRow[];
}): Promise<InventoryQtyApplyOutcome> {
  const writable = args.rows.filter((row) => !row.skipped);
  const batches = chunkItems(writable, INVENTORY_QTY_PER_MUTATION);
  const referenceDocumentUri = `https://spark.app/ai-tasks/${args.taskId}`;
  const outcomes = await mapWithConcurrency(batches, MUTATION_CONCURRENCY, async (batch) => {
    if (args.mode === "adjust") {
      return executeInventoryAdjustQuantities(args.admin, {
        name: "available",
        referenceDocumentUri,
        changes: batch.map((row) => ({
          inventoryItemId: row.inventoryItemId,
          locationId: row.locationId,
          delta: row.delta,
          changeFromQuantity: row.availableBefore,
        })),
      });
    }
    return executeInventorySetQuantities(args.admin, {
      name: "available",
      referenceDocumentUri,
      quantities: batch.map((row) => ({
        inventoryItemId: row.inventoryItemId,
        locationId: row.locationId,
        quantity: row.availableAfter,
        compareQuantity: row.availableBefore,
      })),
    });
  });

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
