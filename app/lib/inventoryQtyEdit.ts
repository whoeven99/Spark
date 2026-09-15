/**
 * 库存数量规则编辑 — 设置 / 增减 / 清零。纯算，不含 IO。
 * 对话规则写 available；导入 on_hand 在 inventoryCsv.ts。
 */
import { toCsv } from "./csv";

export const INVENTORY_QTY_MAX_PRODUCTS = 200;
export const INVENTORY_QTY_MAX_ROWS = 5000;
export const INVENTORY_QTY_PER_MUTATION = 50;

export const INVENTORY_SET_SKILL_ID = "inventory_set";
export const INVENTORY_ADJUST_SKILL_ID = "inventory_adjust";
export const INVENTORY_ZERO_SKILL_ID = "inventory_zero";

export type InventoryQtyMode = "set" | "adjust" | "zero";
export type InventoryAdjustDirection = "up" | "down";

export type InventoryQtyRule = {
  mode: InventoryQtyMode;
  locationId: string;
  locationName: string;
  quantity: number | null;
  direction: InventoryAdjustDirection | null;
  amount: number | null;
};

export type InventoryQtySkipReason =
  | "inventory_untracked"
  | "gift_card"
  | "not_stocked"
  | "location_mismatch"
  | "negative_not_allowed"
  | "no_change"
  | "invalid_quantity";

export type InventoryLevelSnapshot = {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  handle: string;
  option1: string;
  option2: string;
  option3: string;
  inventoryItemId: string;
  locationId: string;
  locationName: string;
  tracked: boolean;
  isGiftCard: boolean;
  stocked: boolean;
  available: number;
  onHand: number;
  committed: number;
  incoming: number;
};

export type InventoryQtyRow = {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  handle: string;
  inventoryItemId: string;
  locationId: string;
  locationName: string;
  availableBefore: number;
  availableAfter: number;
  onHand: number;
  committed: number;
  delta: number;
  skipped: boolean;
  skipReason?: InventoryQtySkipReason;
};

export type InventoryQtySummary = {
  products: number;
  rows: number;
  changed: number;
  skipped: number;
};

export type InventoryQtyApplyOutcome = {
  at: string;
  succeeded: number;
  failed: number;
  errors: Array<{ variantId: string; message: string }>;
};

export class InventoryQtyRuleError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "InventoryQtyRuleError";
    this.code = code;
  }
}

export function parseInventoryInteger(raw: string | undefined): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^-?\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

function parseLocationId(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (!value.startsWith("gid://shopify/Location/")) {
    throw new InventoryQtyRuleError("missing_location", "请选择库存地点");
  }
  return value;
}

export function parseInventoryQtyRule(
  params: Record<string, string>,
  mode: InventoryQtyMode,
): InventoryQtyRule {
  const locationId = parseLocationId(params.locationId);
  const locationName = (params.locationName ?? "").trim();
  if (mode === "set") {
    const quantity = parseInventoryInteger(params.quantity);
    if (quantity == null || quantity < 0) {
      throw new InventoryQtyRuleError("invalid_quantity", "请填写大于等于 0 的整数库存");
    }
    return { mode, locationId, locationName, quantity, direction: null, amount: null };
  }
  if (mode === "adjust") {
    const direction = params.direction === "down" ? "down" : params.direction === "up" ? "up" : null;
    const amount = parseInventoryInteger(params.amount);
    if (!direction || amount == null || amount <= 0) {
      throw new InventoryQtyRuleError("invalid_quantity", "请填写要增加或减少的正整数");
    }
    return { mode, locationId, locationName, quantity: null, direction, amount };
  }
  return { mode, locationId, locationName, quantity: 0, direction: null, amount: null };
}

function skipRow(
  snapshot: InventoryLevelSnapshot,
  reason: InventoryQtySkipReason,
): InventoryQtyRow {
  return {
    variantId: snapshot.variantId,
    productId: snapshot.productId,
    productTitle: snapshot.productTitle,
    variantTitle: snapshot.variantTitle,
    sku: snapshot.sku,
    handle: snapshot.handle,
    inventoryItemId: snapshot.inventoryItemId,
    locationId: snapshot.locationId,
    locationName: snapshot.locationName,
    availableBefore: snapshot.available,
    availableAfter: snapshot.available,
    onHand: snapshot.onHand,
    committed: snapshot.committed,
    delta: 0,
    skipped: true,
    skipReason: reason,
  };
}

function changedRow(snapshot: InventoryLevelSnapshot, after: number): InventoryQtyRow {
  return {
    variantId: snapshot.variantId,
    productId: snapshot.productId,
    productTitle: snapshot.productTitle,
    variantTitle: snapshot.variantTitle,
    sku: snapshot.sku,
    handle: snapshot.handle,
    inventoryItemId: snapshot.inventoryItemId,
    locationId: snapshot.locationId,
    locationName: snapshot.locationName,
    availableBefore: snapshot.available,
    availableAfter: after,
    onHand: snapshot.onHand,
    committed: snapshot.committed,
    delta: after - snapshot.available,
    skipped: false,
  };
}

export function snapshotsForLocation(
  levels: InventoryLevelSnapshot[],
  locationId: string,
  locationName: string,
): InventoryLevelSnapshot[] {
  const byVariant = new Map<string, InventoryLevelSnapshot[]>();
  for (const level of levels) {
    const list = byVariant.get(level.variantId) ?? [];
    list.push(level);
    byVariant.set(level.variantId, list);
  }
  const out: InventoryLevelSnapshot[] = [];
  for (const group of byVariant.values()) {
    const hit = group.find((item) => item.locationId === locationId);
    if (hit) {
      out.push(hit);
      continue;
    }
    const sample = group[0];
    if (!sample) continue;
    out.push({
      ...sample,
      locationId,
      locationName,
      stocked: false,
      available: 0,
      onHand: 0,
      committed: 0,
      incoming: 0,
    });
  }
  return out;
}

export function computeInventoryQtyChange(
  snapshot: InventoryLevelSnapshot,
  rule: InventoryQtyRule,
): InventoryQtyRow {
  if (snapshot.locationId !== rule.locationId) return skipRow(snapshot, "location_mismatch");
  if (snapshot.isGiftCard) return skipRow(snapshot, "gift_card");
  if (!snapshot.tracked) return skipRow(snapshot, "inventory_untracked");
  if (!snapshot.stocked) return skipRow(snapshot, "not_stocked");

  let after = snapshot.available;
  if (rule.mode === "set") after = rule.quantity ?? 0;
  else if (rule.mode === "zero") after = 0;
  else {
    const delta = (rule.amount ?? 0) * (rule.direction === "down" ? -1 : 1);
    after = snapshot.available + delta;
  }
  if (after < 0) return skipRow(snapshot, "negative_not_allowed");
  if (after === snapshot.available) return skipRow(snapshot, "no_change");
  return changedRow(snapshot, after);
}

export function buildInventoryQtySummary(rows: InventoryQtyRow[]): InventoryQtySummary {
  const productIds = new Set<string>();
  let changed = 0;
  let skipped = 0;
  for (const row of rows) {
    productIds.add(row.productId);
    if (row.skipped) skipped += 1;
    else changed += 1;
  }
  return { products: productIds.size, rows: rows.length, changed, skipped };
}

export function buildInventoryQtyChangesetCsv(rows: InventoryQtyRow[]): string {
  return toCsv(
    ["Product", "Variant", "SKU", "Location", "Available before", "Available after", "On hand", "Committed", "Skip"],
    rows.map((row) => [
      row.productTitle,
      row.variantTitle,
      row.sku ?? "",
      row.locationName,
      String(row.availableBefore),
      String(row.availableAfter),
      String(row.onHand),
      String(row.committed),
      row.skipReason ?? "",
    ]),
  );
}

export function buildInventoryQtyRollbackCsv(rows: InventoryQtyRow[]): string {
  return toCsv(
    ["Variant ID", "Location ID", "Available"],
    rows.filter((row) => !row.skipped).map((row) => [row.variantId, row.locationId, String(row.availableBefore)]),
  );
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : Number(value) || 0;
}

export function coerceInventoryQtyRows(raw: unknown): InventoryQtyRow[] {
  if (!Array.isArray(raw)) return [];
  const out: InventoryQtyRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const variantId = asString(record.variantId).trim();
    const inventoryItemId = asString(record.inventoryItemId).trim();
    const locationId = asString(record.locationId).trim();
    if (!variantId || !inventoryItemId || !locationId) continue;
    const skipped = record.skipped === true;
    const availableAfter = asInt(record.availableAfter);
    if (!skipped && availableAfter < 0) continue;
    const skipReason = asString(record.skipReason).trim();
    out.push({
      variantId,
      productId: asString(record.productId),
      productTitle: asString(record.productTitle),
      variantTitle: asString(record.variantTitle),
      sku: asString(record.sku).trim() || null,
      handle: asString(record.handle),
      inventoryItemId,
      locationId,
      locationName: asString(record.locationName),
      availableBefore: asInt(record.availableBefore),
      availableAfter,
      onHand: asInt(record.onHand),
      committed: asInt(record.committed),
      delta: asInt(record.delta),
      skipped,
      ...(skipReason ? { skipReason: skipReason as InventoryQtySkipReason } : {}),
    });
  }
  return out;
}
