/**
 * Shopify 官方库存 CSV（All states）。纯算，不含 IO。
 * 写回列是 On hand (new)；On hand (current) 做 compare-and-set。
 */
import { toCsv } from "./csv";
import type { InventoryLevelSnapshot } from "./inventoryQtyEdit";

export const INVENTORY_EXPORT_SKILL_ID = "inventory_export";
export const INVENTORY_IMPORT_SKILL_ID = "inventory_import";
export const INVENTORY_IMPORT_MAX_FILE_BYTES = 15 * 1024 * 1024;

export const INVENTORY_CSV_HEADERS = [
  "Handle",
  "Title",
  "Option1 Name",
  "Option1 Value",
  "Option2 Name",
  "Option2 Value",
  "Option3 Name",
  "Option3 Value",
  "SKU",
  "HS Code",
  "COO",
  "Location",
  "Bin name",
  "Incoming (not editable)",
  "Unavailable (not editable)",
  "Committed (not editable)",
  "Available (not editable)",
  "On hand (current)",
  "On hand (new)",
] as const;

export type InventoryCsvIssueCode =
  | "unsupported_format"
  | "missing_identity"
  | "invalid_quantity"
  | "location_not_found"
  | "variant_not_found"
  | "stale_on_hand"
  | "committed_blocks_on_hand"
  | "inventory_untracked"
  | "gift_card"
  | "not_stocked"
  | "no_change";

export type InventoryCsvRecord = {
  rowNumber: number;
  handle: string;
  title: string;
  option1: string;
  option2: string;
  option3: string;
  sku: string;
  locationName: string;
  onHandCurrent: number | null;
  onHandNew: number | null;
};

export type InventoryCsvIssue = {
  rowNumber: number;
  code: InventoryCsvIssueCode;
  column?: string;
  value?: string;
};

export type InventoryImportRow = {
  rowNumber: number;
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  handle: string;
  inventoryItemId: string;
  locationId: string;
  locationName: string;
  onHandBefore: number;
  onHandAfter: number;
  available: number;
  committed: number;
  skipped: boolean;
  skipReason?: InventoryCsvIssueCode;
};

function headerKey(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, " ");
}

function cell(row: string[], index: number | undefined): string {
  if (index == null) return "";
  return (row[index] ?? "").trim();
}

export function isInventoryAllStatesSheet(headers: string[]): boolean {
  const keys = new Set(headers.map(headerKey));
  return keys.has("location") && (keys.has("on hand (new)") || keys.has("on hand (current)"));
}

function parseOptionalInt(raw: string): { value: number | null; invalid: boolean } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null, invalid: false };
  if (!/^-?\d+$/.test(trimmed)) return { value: null, invalid: true };
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value)) return { value: null, invalid: true };
  return { value, invalid: false };
}

export function parseInventoryCsvSheet(
  headers: string[],
  rows: string[][],
): { records: InventoryCsvRecord[]; issues: InventoryCsvIssue[] } {
  if (!isInventoryAllStatesSheet(headers)) {
    return {
      records: [],
      issues: [{ rowNumber: 0, code: "unsupported_format" }],
    };
  }
  const index = new Map(headers.map((header, i) => [headerKey(header), i]));
  const issues: InventoryCsvIssue[] = [];
  const records: InventoryCsvRecord[] = [];
  rows.forEach((row, offset) => {
    const rowNumber = offset + 2;
    const locationName = cell(row, index.get("location"));
    const sku = cell(row, index.get("sku"));
    const handle = cell(row, index.get("handle"));
    const current = parseOptionalInt(cell(row, index.get("on hand (current)")));
    const next = parseOptionalInt(cell(row, index.get("on hand (new)")));
    if (current.invalid) {
      issues.push({
        rowNumber,
        code: "invalid_quantity",
        column: "On hand (current)",
        value: cell(row, index.get("on hand (current)")),
      });
      return;
    }
    if (next.invalid) {
      issues.push({
        rowNumber,
        code: "invalid_quantity",
        column: "On hand (new)",
        value: cell(row, index.get("on hand (new)")),
      });
      return;
    }
    if (!locationName || (!sku && !handle)) {
      issues.push({ rowNumber, code: "missing_identity" });
      return;
    }
    records.push({
      rowNumber,
      handle,
      title: cell(row, index.get("title")),
      option1: cell(row, index.get("option1 value")),
      option2: cell(row, index.get("option2 value")),
      option3: cell(row, index.get("option3 value")),
      sku,
      locationName,
      onHandCurrent: current.value,
      onHandNew: next.value,
    });
  });
  return { records, issues };
}

export function buildInventoryExportCsv(
  levels: InventoryLevelSnapshot[],
  optionNames: { option1: string; option2: string; option3: string } = {
    option1: "Option1",
    option2: "Option2",
    option3: "Option3",
  },
): string {
  return toCsv(
    INVENTORY_CSV_HEADERS,
    levels.map((level) => [
      level.handle,
      level.productTitle,
      optionNames.option1,
      level.option1,
      optionNames.option2,
      level.option2,
      optionNames.option3,
      level.option3,
      level.sku ?? "",
      "",
      "",
      level.locationName,
      "",
      String(level.incoming),
      "0",
      String(level.committed),
      String(level.available),
      String(level.onHand),
      "",
    ]),
  );
}

function optionKey(option1: string, option2: string, option3: string): string {
  return [option1, option2, option3].map((value) => value.trim().toLowerCase()).join("\u0000");
}

export function matchInventoryImportRecords(args: {
  records: InventoryCsvRecord[];
  levels: InventoryLevelSnapshot[];
}): { rows: InventoryImportRow[]; issues: InventoryCsvIssue[] } {
  const bySkuLocation = new Map<string, InventoryLevelSnapshot[]>();
  const byHandleLocation = new Map<string, InventoryLevelSnapshot[]>();
  for (const level of args.levels) {
    const locationKey = level.locationName;
    if (level.sku) {
      const key = `${level.sku.toLowerCase()}\u0000${locationKey}`;
      const list = bySkuLocation.get(key) ?? [];
      list.push(level);
      bySkuLocation.set(key, list);
    }
    const handleKey = `${level.handle.toLowerCase()}\u0000${locationKey}`;
    const list = byHandleLocation.get(handleKey) ?? [];
    list.push(level);
    byHandleLocation.set(handleKey, list);
  }

  const issues: InventoryCsvIssue[] = [];
  const rows: InventoryImportRow[] = [];
  for (const record of args.records) {
    let matches: InventoryLevelSnapshot[] = [];
    if (record.sku) {
      matches = bySkuLocation.get(`${record.sku.toLowerCase()}\u0000${record.locationName}`) ?? [];
    }
    if (matches.length === 0 && record.handle) {
      const candidates =
        byHandleLocation.get(`${record.handle.toLowerCase()}\u0000${record.locationName}`) ?? [];
      matches = candidates.filter((level) => {
        if (!record.option1 && !record.option2 && !record.option3) return candidates.length === 1;
        return (
          optionKey(level.option1, level.option2, level.option3) ===
          optionKey(record.option1, record.option2, record.option3)
        );
      });
    }
    if (matches.length !== 1) {
      const locationExists = args.levels.some((level) => level.locationName === record.locationName);
      issues.push({
        rowNumber: record.rowNumber,
        code: locationExists ? "variant_not_found" : "location_not_found",
        value: record.sku || record.handle,
      });
      continue;
    }
    const level = matches[0];
    if (!level) continue;
    rows.push(planImportRow(record, level));
  }
  return { rows, issues };
}

function planImportRow(record: InventoryCsvRecord, level: InventoryLevelSnapshot): InventoryImportRow {
  const base = {
    rowNumber: record.rowNumber,
    variantId: level.variantId,
    productId: level.productId,
    productTitle: level.productTitle,
    variantTitle: level.variantTitle,
    sku: level.sku,
    handle: level.handle,
    inventoryItemId: level.inventoryItemId,
    locationId: level.locationId,
    locationName: level.locationName,
    onHandBefore: level.onHand,
    onHandAfter: level.onHand,
    available: level.available,
    committed: level.committed,
    skipped: true as const,
  };
  if (level.isGiftCard) return { ...base, skipReason: "gift_card" };
  if (!level.tracked) return { ...base, skipReason: "inventory_untracked" };
  if (!level.stocked) return { ...base, skipReason: "not_stocked" };
  if (record.onHandNew == null) return { ...base, skipReason: "no_change" };
  if (record.onHandCurrent != null && record.onHandCurrent !== level.onHand) {
    return { ...base, skipReason: "stale_on_hand" };
  }
  if (record.onHandNew < level.committed) {
    return { ...base, skipReason: "committed_blocks_on_hand" };
  }
  if (record.onHandNew === level.onHand) return { ...base, skipReason: "no_change" };
  return {
    ...base,
    onHandAfter: record.onHandNew,
    skipped: false,
  };
}

export function buildInventoryImportSummary(rows: InventoryImportRow[], issues: InventoryCsvIssue[]) {
  const productIds = new Set(rows.map((row) => row.productId));
  return {
    rows: rows.length + issues.length,
    matched: rows.length,
    changed: rows.filter((row) => !row.skipped).length,
    issues: issues.length + rows.filter((row) => row.skipped && row.skipReason !== "no_change").length,
  };
}

export function buildInventoryImportChangesetCsv(rows: InventoryImportRow[]): string {
  return toCsv(
    ["Row", "Product", "SKU", "Location", "On hand before", "On hand after", "Available", "Committed", "Skip"],
    rows.map((row) => [
      String(row.rowNumber),
      row.productTitle,
      row.sku ?? "",
      row.locationName,
      String(row.onHandBefore),
      String(row.onHandAfter),
      String(row.available),
      String(row.committed),
      row.skipReason ?? "",
    ]),
  );
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : Number(value) || 0;
}

export function coerceInventoryImportRows(raw: unknown): InventoryImportRow[] {
  if (!Array.isArray(raw)) return [];
  const out: InventoryImportRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const inventoryItemId = asString(record.inventoryItemId).trim();
    const locationId = asString(record.locationId).trim();
    if (!inventoryItemId || !locationId) continue;
    const skipped = record.skipped === true;
    const onHandAfter = asInt(record.onHandAfter);
    if (!skipped && onHandAfter < 0) continue;
    const skipReason = asString(record.skipReason).trim();
    out.push({
      rowNumber: asInt(record.rowNumber),
      variantId: asString(record.variantId),
      productId: asString(record.productId),
      productTitle: asString(record.productTitle),
      variantTitle: asString(record.variantTitle),
      sku: asString(record.sku).trim() || null,
      handle: asString(record.handle),
      inventoryItemId,
      locationId,
      locationName: asString(record.locationName),
      onHandBefore: asInt(record.onHandBefore),
      onHandAfter,
      available: asInt(record.available),
      committed: asInt(record.committed),
      skipped,
      ...(skipReason ? { skipReason: skipReason as InventoryCsvIssueCode } : {}),
    });
  }
  return out;
}
