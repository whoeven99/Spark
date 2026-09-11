/**
 * 批量改商品 Handle。与字段模块分开：改 URL 必须显式 New Handle，并带 301。
 */
import { toCsv } from "./csv";

export const BULK_HANDLE_EDIT_MAX_PRODUCTS = 200;
const HANDLE_MAX_LENGTH = 255;

export type BulkHandleEditSkipReason = "no_change" | "invalid_handle" | "handle_taken";

export type BulkHandleEditProductInput = {
  productId: string;
  productTitle: string;
  handle: string;
};

export type BulkHandleEditRow = {
  productId: string;
  productTitle: string;
  beforeHandle: string;
  afterHandle: string;
  skipped: boolean;
  skipReason?: BulkHandleEditSkipReason;
};

export type BulkHandleEditSummary = {
  products: number;
  changed: number;
  skipped: number;
};

export type BulkHandleEditApplyOutcome = {
  at: string;
  succeeded: number;
  failed: number;
  errors: Array<{ productId: string; message: string }>;
};

export function normalizeProductHandle(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, HANDLE_MAX_LENGTH);
}

export function isValidProductHandle(handle: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle) && handle.length > 0 && handle.length <= HANDLE_MAX_LENGTH;
}

export function computeProductHandleChange(
  product: BulkHandleEditProductInput,
  rawHandle: string,
  takenByProductId?: string | null,
): BulkHandleEditRow {
  const beforeHandle = product.handle.trim().toLowerCase();
  const afterHandle = normalizeProductHandle(rawHandle);
  const base: BulkHandleEditRow = {
    productId: product.productId,
    productTitle: product.productTitle,
    beforeHandle,
    afterHandle,
    skipped: false,
  };
  if (!isValidProductHandle(afterHandle)) {
    return { ...base, skipped: true, skipReason: "invalid_handle" };
  }
  if (afterHandle === beforeHandle) {
    return { ...base, skipped: true, skipReason: "no_change" };
  }
  if (takenByProductId && takenByProductId !== product.productId) {
    return { ...base, skipped: true, skipReason: "handle_taken" };
  }
  return base;
}

export function buildBulkHandleEditSummary(rows: BulkHandleEditRow[]): BulkHandleEditSummary {
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

function isSkipReason(value: string): value is BulkHandleEditSkipReason {
  return value === "no_change" || value === "invalid_handle" || value === "handle_taken";
}

export function coerceBulkHandleEditRows(raw: unknown): BulkHandleEditRow[] {
  if (!Array.isArray(raw)) return [];
  const out: BulkHandleEditRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const productId = asString(record.productId).trim();
    if (!productId) continue;
    const skipped = record.skipped === true;
    const skipReason = asString(record.skipReason).trim();
    out.push({
      productId,
      productTitle: asString(record.productTitle),
      beforeHandle: asString(record.beforeHandle),
      afterHandle: asString(record.afterHandle),
      skipped,
      ...(isSkipReason(skipReason) ? { skipReason } : {}),
    });
  }
  return out;
}

export function buildBulkHandleEditChangesetCsv(rows: BulkHandleEditRow[]): string {
  return toCsv(
    ["product_title", "product_id", "before_handle", "after_handle", "action", "reason"] as const,
    rows.map((row) => [
      row.productTitle,
      row.productId,
      row.beforeHandle,
      row.skipped ? "" : row.afterHandle,
      row.skipped ? "skip" : "change",
      row.skipped ? (row.skipReason ?? "") : "",
    ]),
  );
}

export function buildBulkHandleEditRollbackCsv(rows: BulkHandleEditRow[]): string {
  return toCsv(
    ["product_id", "product_title", "rollback_handle"] as const,
    rows.filter((row) => !row.skipped).map((row) => [row.productId, row.productTitle, row.beforeHandle]),
  );
}
