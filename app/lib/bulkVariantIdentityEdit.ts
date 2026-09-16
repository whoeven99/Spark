/**
 * 变体身份字段：SKU / Barcode / 重量。纯算。
 * 写回走 productVariantsBulkUpdate，不申请 write_inventory。
 */
import { toCsv } from "./csv";

export const VARIANT_IDENTITY_VARIANTS_PER_MUTATION = 250;

export type WeightUnit = "GRAMS" | "KILOGRAMS" | "OUNCES" | "POUNDS";

export type VariantIdentityInput = {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  barcode: string | null;
  inventoryItemId: string | null;
  weightValue: number | null;
  weightUnit: WeightUnit | null;
};

export type VariantIdentityChange = {
  sku?: string | null;
  barcode?: string | null;
  weightValue?: number | null;
  weightUnit?: WeightUnit | null;
};

export type VariantIdentitySkipReason =
  | "no_change"
  | "missing_inventory_item"
  | "invalid_weight"
  | "sku_is_identity_only";

export type VariantIdentityRow = {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  inventoryItemId: string;
  beforeSku: string | null;
  afterSku: string | null;
  skuChanged: boolean;
  beforeBarcode: string | null;
  afterBarcode: string | null;
  barcodeChanged: boolean;
  beforeWeight: string;
  afterWeight: string;
  weightChanged: boolean;
  skipped: boolean;
  skipReason?: VariantIdentitySkipReason;
};

const UNIT_ALIASES: Record<string, WeightUnit> = {
  g: "GRAMS",
  gram: "GRAMS",
  grams: "GRAMS",
  kg: "KILOGRAMS",
  kilogram: "KILOGRAMS",
  kilograms: "KILOGRAMS",
  oz: "OUNCES",
  ounce: "OUNCES",
  ounces: "OUNCES",
  lb: "POUNDS",
  lbs: "POUNDS",
  pound: "POUNDS",
  pounds: "POUNDS",
};

export function parseWeightUnit(raw: string): WeightUnit | null {
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  return UNIT_ALIASES[key] ?? null;
}

export function formatWeight(value: number | null, unit: WeightUnit | null): string {
  if (value == null || unit == null) return "";
  return `${value} ${unit.toLowerCase()}`;
}

export function parseWeightValue(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, "");
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

export function computeVariantIdentityChange(
  variant: VariantIdentityInput,
  change: VariantIdentityChange,
): VariantIdentityRow {
  const beforeWeight = formatWeight(variant.weightValue, variant.weightUnit);
  const afterSku = change.sku !== undefined ? change.sku : variant.sku;
  const afterBarcode = change.barcode !== undefined ? change.barcode : variant.barcode;
  const afterWeightValue = change.weightValue !== undefined ? change.weightValue : variant.weightValue;
  const afterWeightUnit = change.weightUnit !== undefined ? change.weightUnit : variant.weightUnit;
  const afterWeight = formatWeight(afterWeightValue, afterWeightUnit);
  const skuChanged = change.sku !== undefined && (afterSku ?? "") !== (variant.sku ?? "");
  const barcodeChanged = change.barcode !== undefined && (afterBarcode ?? "") !== (variant.barcode ?? "");
  const weightChanged =
    change.weightValue !== undefined &&
    (afterWeightValue !== variant.weightValue || afterWeightUnit !== variant.weightUnit);
  const base: VariantIdentityRow = {
    variantId: variant.variantId,
    productId: variant.productId,
    productTitle: variant.productTitle,
    variantTitle: variant.variantTitle,
    inventoryItemId: variant.inventoryItemId ?? "",
    beforeSku: variant.sku,
    afterSku: afterSku ?? null,
    skuChanged,
    beforeBarcode: variant.barcode,
    afterBarcode: afterBarcode ?? null,
    barcodeChanged,
    beforeWeight,
    afterWeight,
    weightChanged,
    skipped: false,
  };
  if ((skuChanged || weightChanged) && !variant.inventoryItemId) {
    return { ...base, skipped: true, skipReason: "missing_inventory_item" };
  }
  if (change.weightValue !== undefined && change.weightValue != null && change.weightValue < 0) {
    return { ...base, skipped: true, skipReason: "invalid_weight" };
  }
  if (!skuChanged && !barcodeChanged && !weightChanged) {
    return { ...base, skipped: true, skipReason: "no_change" };
  }
  return base;
}

export function coerceVariantIdentityRows(raw: unknown): VariantIdentityRow[] {
  if (!Array.isArray(raw)) return [];
  const out: VariantIdentityRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<VariantIdentityRow>;
    if (!row.variantId || !row.productId) continue;
    out.push({
      variantId: String(row.variantId),
      productId: String(row.productId),
      productTitle: String(row.productTitle ?? ""),
      variantTitle: String(row.variantTitle ?? ""),
      inventoryItemId: String(row.inventoryItemId ?? ""),
      beforeSku: typeof row.beforeSku === "string" ? row.beforeSku : null,
      afterSku: typeof row.afterSku === "string" ? row.afterSku : null,
      skuChanged: row.skuChanged === true,
      beforeBarcode: typeof row.beforeBarcode === "string" ? row.beforeBarcode : null,
      afterBarcode: typeof row.afterBarcode === "string" ? row.afterBarcode : null,
      barcodeChanged: row.barcodeChanged === true,
      beforeWeight: String(row.beforeWeight ?? ""),
      afterWeight: String(row.afterWeight ?? ""),
      weightChanged: row.weightChanged === true,
      skipped: row.skipped === true,
      ...(row.skipReason ? { skipReason: row.skipReason } : {}),
    });
  }
  return out;
}

export function buildVariantIdentityMutationInput(row: VariantIdentityRow): Record<string, unknown> {
  const payload: Record<string, unknown> = { id: row.variantId };
  if (row.barcodeChanged) payload.barcode = row.afterBarcode ?? "";
  if (row.skuChanged || row.weightChanged) {
    const inventoryItem: Record<string, unknown> = {};
    if (row.skuChanged) inventoryItem.sku = row.afterSku ?? "";
    if (row.weightChanged) {
      const parsed = parseAfterWeight(row.afterWeight);
      if (parsed) inventoryItem.measurement = { weight: parsed };
    }
    payload.inventoryItem = inventoryItem;
  }
  return payload;
}

function parseAfterWeight(raw: string): { value: number; unit: WeightUnit } | null {
  const match = raw.trim().match(/^([\d.]+)\s+([a-z]+)$/i);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = parseWeightUnit(match[2] ?? "");
  if (!Number.isFinite(value) || !unit) return null;
  return { value, unit };
}

export function buildVariantIdentityChangesetCsv(rows: VariantIdentityRow[]): string {
  return toCsv(
    ["Product", "Variant", "SKU before", "SKU after", "Barcode before", "Barcode after", "Weight before", "Weight after"],
    rows.map((row) => [
      row.productTitle,
      row.variantTitle,
      row.beforeSku ?? "",
      row.afterSku ?? "",
      row.beforeBarcode ?? "",
      row.afterBarcode ?? "",
      row.beforeWeight,
      row.afterWeight,
    ]),
  );
}
