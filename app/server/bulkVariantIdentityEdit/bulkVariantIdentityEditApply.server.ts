/**
 * SKU / Barcode / 重量写回。走已有 productVariantsBulkUpdate helper。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import {
  VARIANT_IDENTITY_VARIANTS_PER_MUTATION,
  buildVariantIdentityMutationInput,
  coerceVariantIdentityRows,
  type VariantIdentityRow,
} from "../../lib/bulkVariantIdentityEdit";
import { mapWithConcurrency } from "../shopify/productIdQuery.server";
import { executeProductVariantsBulkUpdate } from "../shopify/productVariantsBulkUpdate.server";

const MUTATION_CONCURRENCY = 2;

export type VariantIdentityApplyOutcome = {
  at: string;
  succeeded: number;
  failed: number;
  errors: Array<{ variantId: string; message: string }>;
};

export async function applyVariantIdentityEdit(args: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  rows: VariantIdentityRow[] | unknown;
}): Promise<VariantIdentityApplyOutcome> {
  const writable = coerceVariantIdentityRows(args.rows).filter((row) => !row.skipped);
  const byProduct = new Map<string, VariantIdentityRow[]>();
  for (const row of writable) {
    const list = byProduct.get(row.productId) ?? [];
    list.push(row);
    byProduct.set(row.productId, list);
  }
  const batches: Array<{ productId: string; rows: VariantIdentityRow[] }> = [];
  for (const [productId, rows] of byProduct) {
    for (let i = 0; i < rows.length; i += VARIANT_IDENTITY_VARIANTS_PER_MUTATION) {
      batches.push({ productId, rows: rows.slice(i, i + VARIANT_IDENTITY_VARIANTS_PER_MUTATION) });
    }
  }
  const outcomes = await mapWithConcurrency(batches, MUTATION_CONCURRENCY, async (batch) => {
    const result = await executeProductVariantsBulkUpdate(
      args.admin,
      batch.productId,
      batch.rows.map(buildVariantIdentityMutationInput),
    );
    if (result.error) {
      return {
        succeeded: 0,
        errors: batch.rows.map((row) => ({ variantId: row.variantId, message: result.error as string })),
      };
    }
    return { succeeded: batch.rows.length, errors: [] as Array<{ variantId: string; message: string }> };
  });
  let succeeded = 0;
  const errors: Array<{ variantId: string; message: string }> = [];
  for (const outcome of outcomes) {
    succeeded += outcome.succeeded;
    errors.push(...outcome.errors);
  }
  console.info(
    `[VariantIdentity][Apply] shop=${args.shop} succeeded=${succeeded} failed=${errors.length}`,
  );
  return { at: new Date().toISOString(), succeeded, failed: errors.length, errors: errors.slice(0, 50) };
}
