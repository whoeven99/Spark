/**
 * 库存导入确认卡表格预览：只解析文件，不对照店铺。纯算。
 */
import {
  mapInventoryCsvHeaders,
  parseInventoryCsvRecords,
  parseNonNegativeInt,
  type InventoryCsvRecord,
} from "./inventoryCsv";

export const INVENTORY_IMPORT_SHEET_PREVIEW_SAMPLE_ROWS = 20;

export type InventoryImportSheetPreviewBlock =
  | "wrong_sheet"
  | "missing_identity"
  | "no_usable_rows";

export type InventoryImportSheetPreviewIssue = {
  rowNumber: number;
  code: "invalid_on_hand" | "missing_location" | "missing_identity";
  column?: string;
  value?: string;
};

export type InventoryImportSheetPreviewColumn = {
  key: string;
  header: string;
};

export type InventoryImportSheetPreviewRow = {
  rowNumber: number;
  cells: string[];
};

export type InventoryImportSheetPreview = {
  fileName: string;
  rowCount: number;
  filledNewCount: number;
  locationNames: string[];
  unknownColumns: string[];
  hasLocationColumn: boolean;
  hasOnHandNewColumn: boolean;
  columns: InventoryImportSheetPreviewColumn[];
  sampleRows: InventoryImportSheetPreviewRow[];
  issues: InventoryImportSheetPreviewIssue[];
  issueCount: number;
  blockedReason: InventoryImportSheetPreviewBlock | null;
};

const PREVIEW_COLUMNS: Array<{ key: string; header: string; cell: (record: InventoryCsvRecord) => string }> = [
  { key: "handle", header: "Handle", cell: (record) => record.handle },
  { key: "title", header: "Title", cell: (record) => record.title },
  { key: "option1Value", header: "Option1 Value", cell: (record) => record.option1Value },
  { key: "sku", header: "SKU", cell: (record) => record.sku },
  { key: "location", header: "Location", cell: (record) => record.location },
  { key: "onHandCurrent", header: "On hand (current)", cell: (record) => record.onHandCurrent },
  { key: "onHandNew", header: "On hand (new)", cell: (record) => record.onHandNew },
];

export function isInventoryImportSheetPreviewBlocked(
  preview: Pick<InventoryImportSheetPreview, "blockedReason">,
): boolean {
  return preview.blockedReason != null;
}

export function buildInventoryImportSheetPreview(args: {
  fileName: string;
  headers: string[];
  rows: string[][];
}): InventoryImportSheetPreview {
  const mapped = mapInventoryCsvHeaders(args.headers);
  const records = parseInventoryCsvRecords(args.headers, args.rows);
  const hasLocationColumn = mapped.columns.location != null;
  const hasOnHandNewColumn = mapped.columns.onHandNew != null;
  const hasHandleColumn = mapped.columns.handle != null;
  const hasSkuColumn = mapped.columns.sku != null;
  const columns = PREVIEW_COLUMNS.filter((column) => {
    if (column.key === "handle") return hasHandleColumn;
    if (column.key === "title") return mapped.columns.title != null;
    if (column.key === "option1Value") return mapped.columns.option1Value != null;
    if (column.key === "sku") return hasSkuColumn;
    if (column.key === "location") return hasLocationColumn;
    if (column.key === "onHandCurrent") return mapped.columns.onHandCurrent != null;
    if (column.key === "onHandNew") return hasOnHandNewColumn;
    return false;
  });
  const locationNames: string[] = [];
  const seenLocations = new Set<string>();
  for (const record of records) {
    const name = record.location.trim();
    if (!name || seenLocations.has(name)) continue;
    seenLocations.add(name);
    locationNames.push(name);
    if (locationNames.length >= 8) break;
  }
  const issues: InventoryImportSheetPreviewIssue[] = [];
  for (const record of records) {
    if (record.onHandNew && parseNonNegativeInt(record.onHandNew) == null) {
      issues.push({
        rowNumber: record.rowNumber,
        code: "invalid_on_hand",
        column: "On hand (new)",
        value: record.onHandNew,
      });
    }
    if (hasLocationColumn && record.onHandNew && !record.location) {
      issues.push({ rowNumber: record.rowNumber, code: "missing_location", column: "Location" });
    }
    if ((hasHandleColumn || hasSkuColumn) && record.onHandNew && !record.handle && !record.sku) {
      issues.push({ rowNumber: record.rowNumber, code: "missing_identity" });
    }
  }
  const blockedReason = !hasLocationColumn || !hasOnHandNewColumn
    ? "wrong_sheet"
    : !hasHandleColumn && !hasSkuColumn
      ? "missing_identity"
      : records.length === 0
        ? "no_usable_rows"
        : null;
  return {
    fileName: args.fileName,
    rowCount: records.length,
    filledNewCount: records.filter((record) => Boolean(record.onHandNew.trim())).length,
    locationNames,
    unknownColumns: mapped.unknown,
    hasLocationColumn,
    hasOnHandNewColumn,
    columns,
    sampleRows: records.slice(0, INVENTORY_IMPORT_SHEET_PREVIEW_SAMPLE_ROWS).map((record) => ({
      rowNumber: record.rowNumber,
      cells: columns.map((column) => column.cell(record)),
    })),
    issues: issues.slice(0, 8),
    issueCount: issues.length,
    blockedReason,
  };
}

export function coerceInventoryImportSheetPreview(raw: unknown): InventoryImportSheetPreview | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.fileName !== "string") return null;
  const columns = coerceColumns(record.columns);
  return {
    fileName: record.fileName,
    rowCount: toCount(record.rowCount),
    filledNewCount: toCount(record.filledNewCount),
    locationNames: coerceStringList(record.locationNames),
    unknownColumns: coerceStringList(record.unknownColumns),
    hasLocationColumn: record.hasLocationColumn !== false,
    hasOnHandNewColumn: record.hasOnHandNewColumn !== false,
    columns,
    sampleRows: coerceSampleRows(record.sampleRows, columns.length),
    issues: coerceIssues(record.issues),
    issueCount: toCount(record.issueCount),
    blockedReason: coerceBlockedReason(record.blockedReason),
  };
}

function coerceColumns(raw: unknown): InventoryImportSheetPreviewColumn[] {
  if (!Array.isArray(raw)) return [];
  const out: InventoryImportSheetPreviewColumn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.key !== "string" || typeof record.header !== "string") continue;
    out.push({ key: record.key, header: record.header });
  }
  return out;
}

function coerceSampleRows(raw: unknown, columnCount: number): InventoryImportSheetPreviewRow[] {
  if (!Array.isArray(raw)) return [];
  const out: InventoryImportSheetPreviewRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const rowNumber = toCount(record.rowNumber);
    if (rowNumber <= 0 || !Array.isArray(record.cells)) continue;
    out.push({
      rowNumber,
      cells: record.cells
        .filter((cell): cell is string => typeof cell === "string")
        .slice(0, columnCount || record.cells.length),
    });
  }
  return out;
}

function coerceIssues(raw: unknown): InventoryImportSheetPreviewIssue[] {
  if (!Array.isArray(raw)) return [];
  const out: InventoryImportSheetPreviewIssue[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Partial<InventoryImportSheetPreviewIssue>;
    if (
      record.code !== "invalid_on_hand" &&
      record.code !== "missing_location" &&
      record.code !== "missing_identity"
    ) {
      continue;
    }
    out.push({
      rowNumber: Number(record.rowNumber) || 0,
      code: record.code,
      ...(record.column ? { column: String(record.column) } : {}),
      ...(record.value ? { value: String(record.value) } : {}),
    });
  }
  return out;
}

function coerceBlockedReason(raw: unknown): InventoryImportSheetPreviewBlock | null {
  if (raw === "wrong_sheet" || raw === "missing_identity" || raw === "no_usable_rows") return raw;
  return null;
}

function coerceStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
}

function toCount(raw: unknown): number {
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}
