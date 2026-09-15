/**
 * 批量归档商品。与上下架分开：上下架故意跳过 ARCHIVED，归档是把商品改成 ARCHIVED。
 */
import { toCsv } from "./csv";

export const BULK_ARCHIVE_MAX_PRODUCTS = 200;

export type BulkArchiveProductInput = {
  productId: string;
  productTitle: string;
  status: string;
};

export type BulkArchiveSkipReason = "no_change";

export type BulkArchiveRow = {
  productId: string;
  productTitle: string;
  beforeStatus: string;
  afterStatus: "ARCHIVED";
  skipped: boolean;
  skipReason?: BulkArchiveSkipReason;
};

export type BulkArchiveSummary = {
  products: number;
  changed: number;
  skipped: number;
};

export type BulkArchiveApplyOutcome = {
  at: string;
  succeeded: number;
  failed: number;
  errors: Array<{ productId: string; message: string }>;
};

function normalizeStatus(raw: string): string {
  return raw.trim().toUpperCase();
}

export function computeProductArchive(product: BulkArchiveProductInput): BulkArchiveRow {
  const beforeStatus = normalizeStatus(product.status);
  if (beforeStatus === "ARCHIVED") {
    return {
      productId: product.productId,
      productTitle: product.productTitle,
      beforeStatus,
      afterStatus: "ARCHIVED",
      skipped: true,
      skipReason: "no_change",
    };
  }
  return {
    productId: product.productId,
    productTitle: product.productTitle,
    beforeStatus,
    afterStatus: "ARCHIVED",
    skipped: false,
  };
}

export function buildBulkArchiveSummary(rows: BulkArchiveRow[]): BulkArchiveSummary {
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

export function coerceBulkArchiveRows(raw: unknown): BulkArchiveRow[] {
  if (!Array.isArray(raw)) return [];
  const out: BulkArchiveRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const productId = asString(record.productId).trim();
    if (!productId) continue;
    const skipped = record.skipped === true;
    const beforeStatus = normalizeStatus(asString(record.beforeStatus));
    if (!skipped && beforeStatus === "ARCHIVED") continue;
    out.push({
      productId,
      productTitle: asString(record.productTitle),
      beforeStatus,
      afterStatus: "ARCHIVED",
      skipped,
      ...(asString(record.skipReason) === "no_change" ? { skipReason: "no_change" } : {}),
    });
  }
  return out;
}

export function buildBulkArchiveChangesetCsv(rows: BulkArchiveRow[]): string {
  return toCsv(
    ["product_title", "product_id", "before_status", "after_status", "action", "reason"] as const,
    rows.map((row) => [
      row.productTitle,
      row.productId,
      row.beforeStatus,
      row.skipped ? "" : row.afterStatus,
      row.skipped ? "skip" : "archive",
      row.skipped ? (row.skipReason ?? "") : "",
    ]),
  );
}

export function buildBulkArchiveRollbackCsv(rows: BulkArchiveRow[]): string {
  return toCsv(
    ["product_id", "product_title", "rollback_status"] as const,
    rows
      .filter((row) => !row.skipped)
      .map((row) => [row.productId, row.productTitle, row.beforeStatus]),
  );
}
