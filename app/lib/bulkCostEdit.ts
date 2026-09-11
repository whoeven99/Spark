/**
 * 变体单位成本 — 规则 → changeset。纯算，不含 Shopify IO。
 * 写回走 productVariantsBulkUpdate.inventoryItem.cost，不申请 write_inventory。
 */
import { formatCentsToMoney, parseMoneyToCents } from "./bulkPriceEdit";
import { toCsv } from "./csv";

export const BULK_COST_EDIT_MAX_PRODUCTS = 200;
export const BULK_COST_EDIT_MAX_VARIANTS = 1000;
export const BULK_COST_EDIT_VARIANTS_PER_MUTATION = 250;

export type BulkCostEditSkipReason =
  | "no_change"
  | "invalid_cost"
  | "missing_inventory_item";

export type BulkCostEditVariantInput = {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  inventoryItemId: string | null;
  cost: string | null;
};

export type BulkCostEditRow = {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  inventoryItemId: string;
  beforeCost: string | null;
  afterCost: string;
  skipped: boolean;
  skipReason?: BulkCostEditSkipReason;
};

export type BulkCostEditSummary = {
  products: number;
  variants: number;
  changed: number;
  skipped: number;
};

export type BulkCostEditApplyOutcome = {
  at: string;
  succeeded: number;
  failed: number;
  errors: Array<{ variantId: string; message: string }>;
};

export function computeVariantCostChange(
  variant: BulkCostEditVariantInput,
  rawCost: string,
): BulkCostEditRow {
  const afterCents = parseMoneyToCents(rawCost.replace(/,/g, ""));
  const beforeCents = parseMoneyToCents(variant.cost);
  const afterCost = afterCents != null ? formatCentsToMoney(afterCents) : "";
  const beforeCost = beforeCents != null ? formatCentsToMoney(beforeCents) : variant.cost;
  const base = {
    variantId: variant.variantId,
    productId: variant.productId,
    productTitle: variant.productTitle,
    variantTitle: variant.variantTitle,
    sku: variant.sku,
    inventoryItemId: variant.inventoryItemId ?? "",
    beforeCost,
    afterCost,
    skipped: false as const,
  };
  if (!variant.inventoryItemId) {
    return { ...base, skipped: true, skipReason: "missing_inventory_item" };
  }
  if (afterCents == null) {
    return { ...base, skipped: true, skipReason: "invalid_cost" };
  }
  if (beforeCost === afterCost) {
    return { ...base, skipped: true, skipReason: "no_change" };
  }
  return { ...base, inventoryItemId: variant.inventoryItemId, afterCost };
}

export function buildBulkCostEditSummary(rows: BulkCostEditRow[]): BulkCostEditSummary {
  const products = new Set(rows.map((row) => row.productId));
  let changed = 0;
  let skipped = 0;
  for (const row of rows) {
    if (row.skipped) skipped += 1;
    else changed += 1;
  }
  return { products: products.size, variants: rows.length, changed, skipped };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isSkipReason(value: string): value is BulkCostEditSkipReason {
  return value === "no_change" || value === "invalid_cost" || value === "missing_inventory_item";
}

export function coerceBulkCostEditRows(raw: unknown): BulkCostEditRow[] {
  if (!Array.isArray(raw)) return [];
  const out: BulkCostEditRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const variantId = asString(record.variantId).trim();
    const productId = asString(record.productId).trim();
    const inventoryItemId = asString(record.inventoryItemId).trim();
    if (!variantId || !productId) continue;
    const skipped = record.skipped === true;
    const skipReason = asString(record.skipReason).trim();
    out.push({
      variantId,
      productId,
      productTitle: asString(record.productTitle),
      variantTitle: asString(record.variantTitle),
      sku: asString(record.sku) || null,
      inventoryItemId,
      beforeCost: asString(record.beforeCost) || null,
      afterCost: asString(record.afterCost),
      skipped,
      ...(isSkipReason(skipReason) ? { skipReason } : {}),
    });
  }
  return out;
}

export function buildBulkCostEditChangesetCsv(rows: BulkCostEditRow[]): string {
  return toCsv(
    ["product_title", "variant_title", "sku", "before_cost", "after_cost", "action", "reason"] as const,
    rows.map((row) => [
      row.productTitle,
      row.variantTitle,
      row.sku ?? "",
      row.beforeCost ?? "",
      row.skipped ? "" : row.afterCost,
      row.skipped ? "skip" : "change",
      row.skipped ? (row.skipReason ?? "") : "",
    ]),
  );
}

export function buildBulkCostEditRollbackCsv(rows: BulkCostEditRow[]): string {
  return toCsv(
    ["variant_id", "sku", "rollback_cost"] as const,
    rows.filter((row) => !row.skipped).map((row) => [row.variantId, row.sku ?? "", row.beforeCost ?? ""]),
  );
}
