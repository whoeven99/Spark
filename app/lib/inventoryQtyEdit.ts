/**
 * 按规则改可售库存（Available）：设置 / 增减 / 清零。纯算。
 * CSV 导入走 inventoryImport.ts，改的是 On hand。
 */
import { toCsv } from "./csv";

export const INVENTORY_QTY_EDIT_SKILL_ID = "inventory_qty_edit";
export const INVENTORY_QTY_MAX_PRODUCTS = 200;
export const INVENTORY_QTY_MAX_VARIANTS = 1000;
export const INVENTORY_QTY_MUTATION_BATCH = 50;

export type InventoryQtyMode = "set" | "adjust" | "clear";

export type InventoryQtyEditRule = {
  mode: InventoryQtyMode;
  /** set：目标可售；adjust：差额（可负）；clear：忽略 */
  value: number;
  locationId: string;
  locationName: string;
  allWritableLocations: boolean;
};

export type InventoryQtyEditSkipReason =
  | "no_change"
  | "untracked"
  | "not_stocked"
  | "location_not_writable"
  | "would_go_negative"
  | "invalid_quantity";

export type InventoryQtyLevelInput = {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  inventoryItemId: string;
  tracked: boolean;
  locationId: string;
  locationName: string;
  writable: boolean;
  stocked: boolean;
  available: number;
  onHand: number;
  committed: number;
};

export type InventoryQtyEditRow = {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  inventoryItemId: string;
  locationId: string;
  locationName: string;
  beforeAvailable: number;
  afterAvailable: number;
  skipped: boolean;
  skipReason?: InventoryQtyEditSkipReason;
};

export type InventoryQtyEditSummary = {
  products: number;
  variants: number;
  changed: number;
  skipped: number;
};

export type InventoryQtyEditApplyOutcome = {
  at: string;
  succeeded: number;
  failed: number;
  errors: Array<{ variantId: string; locationId: string; message: string }>;
};

export class InventoryQtyEditRuleError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "InventoryQtyEditRuleError";
    this.code = code;
  }
}

export function isInventoryQtyMode(value: unknown): value is InventoryQtyMode {
  return value === "set" || value === "adjust" || value === "clear";
}

export function parseInventoryQtyEditRule(params: Record<string, string>): InventoryQtyEditRule {
  const modeRaw = (params.mode ?? params.qtyMode ?? "").trim();
  if (!isInventoryQtyMode(modeRaw)) {
    throw new InventoryQtyEditRuleError("invalid_mode", "请选择设置、增减或清零");
  }
  const allWritableLocations = params.allWritableLocations === "true";
  const locationId = params.location?.trim() || params.locationId?.trim() || "";
  const locationName = params.locationName?.trim() || locationId;
  if (!allWritableLocations && !locationId) {
    throw new InventoryQtyEditRuleError("missing_location", "请选择要改库存的仓库");
  }
  if (modeRaw === "clear") {
    if (params.clearAck !== "true") {
      throw new InventoryQtyEditRuleError("clear_not_confirmed", "清零前请勾选确认");
    }
    return { mode: "clear", value: 0, locationId, locationName, allWritableLocations };
  }
  const value = Number(params.qtyValue ?? params.value ?? params.delta ?? "");
  if (!Number.isInteger(value)) {
    throw new InventoryQtyEditRuleError("invalid_quantity", "数量必须是整数");
  }
  if (modeRaw === "set" && value < 0) {
    throw new InventoryQtyEditRuleError("invalid_quantity", "可售数量不能为负数");
  }
  if (modeRaw === "adjust" && value === 0) {
    throw new InventoryQtyEditRuleError("invalid_quantity", "增减差额不能为 0");
  }
  return { mode: modeRaw, value, locationId, locationName, allWritableLocations };
}

export function computeInventoryQtyChange(
  level: InventoryQtyLevelInput,
  rule: InventoryQtyEditRule,
): InventoryQtyEditRow {
  const base = {
    variantId: level.variantId,
    productId: level.productId,
    productTitle: level.productTitle,
    variantTitle: level.variantTitle,
    sku: level.sku,
    inventoryItemId: level.inventoryItemId,
    locationId: level.locationId,
    locationName: level.locationName,
    beforeAvailable: level.available,
    afterAvailable: level.available,
    skipped: true as const,
  };
  if (!level.tracked) return { ...base, skipReason: "untracked" };
  if (!level.writable) return { ...base, skipReason: "location_not_writable" };
  if (!level.stocked) return { ...base, skipReason: "not_stocked" };
  let after = level.available;
  if (rule.mode === "set") after = rule.value;
  else if (rule.mode === "adjust") after = level.available + rule.value;
  else after = 0;
  if (after < 0) return { ...base, skipReason: "would_go_negative" };
  if (after === level.available) return { ...base, skipReason: "no_change" };
  return { ...base, afterAvailable: after, skipped: false };
}

export function buildInventoryQtyEditSummary(rows: InventoryQtyEditRow[]): InventoryQtyEditSummary {
  const products = new Set(rows.map((row) => row.productId));
  return {
    products: products.size,
    variants: rows.length,
    changed: rows.filter((row) => !row.skipped).length,
    skipped: rows.filter((row) => row.skipped).length,
  };
}

export function coerceInventoryQtyEditRows(raw: unknown): InventoryQtyEditRow[] {
  if (!Array.isArray(raw)) return [];
  const out: InventoryQtyEditRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<InventoryQtyEditRow>;
    if (!row.variantId || !row.inventoryItemId || !row.locationId) continue;
    out.push({
      variantId: String(row.variantId),
      productId: String(row.productId ?? ""),
      productTitle: String(row.productTitle ?? ""),
      variantTitle: String(row.variantTitle ?? ""),
      sku: typeof row.sku === "string" ? row.sku : null,
      inventoryItemId: String(row.inventoryItemId),
      locationId: String(row.locationId),
      locationName: String(row.locationName ?? ""),
      beforeAvailable: Number(row.beforeAvailable) || 0,
      afterAvailable: Number(row.afterAvailable) || 0,
      skipped: row.skipped === true,
      ...(row.skipReason ? { skipReason: row.skipReason } : {}),
    });
  }
  return out;
}

export function buildInventoryQtyEditChangesetCsv(rows: InventoryQtyEditRow[]): string {
  return toCsv(
    ["Product", "Variant", "SKU", "Location", "Available before", "Available after", "Action"],
    rows.map((row) => [
      row.productTitle,
      row.variantTitle,
      row.sku ?? "",
      row.locationName,
      String(row.beforeAvailable),
      String(row.afterAvailable),
      row.skipped ? row.skipReason ?? "skip" : "change",
    ]),
  );
}

export function buildInventoryQtyEditRollbackCsv(rows: InventoryQtyEditRow[]): string {
  return toCsv(
    ["Product", "Variant", "SKU", "Location", "Available"],
    rows
      .filter((row) => !row.skipped)
      .map((row) => [
        row.productTitle,
        row.variantTitle,
        row.sku ?? "",
        row.locationName,
        String(row.beforeAvailable),
      ]),
  );
}
