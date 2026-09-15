/**
 * 批量删除商品。不可恢复，与归档分开。
 */
import { toCsv } from "./csv";

export const BULK_PRODUCT_DELETE_MAX_PRODUCTS = 200;

export type BulkProductDeleteRow = {
  productId: string;
  productTitle: string;
  handle: string;
  skipped: boolean;
  skipReason?: "already_listed";
};

export type BulkProductDeleteSummary = {
  products: number;
  changed: number;
  skipped: number;
};

export type BulkProductDeleteApplyOutcome = {
  at: string;
  succeeded: number;
  failed: number;
  errors: Array<{ productId: string; message: string }>;
};

export function computeProductDelete(product: {
  productId: string;
  productTitle: string;
  handle: string;
}): BulkProductDeleteRow {
  return {
    productId: product.productId,
    productTitle: product.productTitle,
    handle: product.handle,
    skipped: false,
  };
}

export function buildBulkProductDeleteSummary(rows: BulkProductDeleteRow[]): BulkProductDeleteSummary {
  let changed = 0;
  let skipped = 0;
  for (const row of rows) {
    if (row.skipped) skipped += 1;
    else changed += 1;
  }
  return { products: rows.length, changed, skipped };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function coerceBulkProductDeleteRows(raw: unknown): BulkProductDeleteRow[] {
  if (!Array.isArray(raw)) return [];
  const out: BulkProductDeleteRow[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const productId = asString(record.productId).trim();
    if (!productId) continue;
    const skipped = record.skipped === true;
    if (!skipped && seen.has(productId)) continue;
    if (!skipped) seen.add(productId);
    out.push({
      productId,
      productTitle: asString(record.productTitle),
      handle: asString(record.handle),
      skipped,
      ...(asString(record.skipReason) === "already_listed" ? { skipReason: "already_listed" } : {}),
    });
  }
  return out;
}

export function countWritableProductDeletes(rows: BulkProductDeleteRow[]): number {
  return rows.filter((row) => !row.skipped).length;
}

export function buildBulkProductDeleteChangesetCsv(rows: BulkProductDeleteRow[]): string {
  return toCsv(
    ["product_title", "product_id", "handle", "action"] as const,
    rows.map((row) => [
      row.productTitle,
      row.productId,
      row.handle,
      row.skipped ? "skip" : "delete",
    ]),
  );
}
