/**
 * 导入表格预览：解析结果压成确认卡 / running 弹窗能展示的摘要。纯算，不含 IO。
 * 不含店铺匹配，因此没有原值/新值。
 */
import {
  coerceProductImportIssues,
  coerceProductImportOperations,
  detectImportOperations,
  type ProductImportIssue,
  type ProductImportOperation,
  type ProductImportRecord,
  type ProductImportSheetAnalysis,
} from "./productImport";

export const PRODUCT_IMPORT_SHEET_PREVIEW_SAMPLE_ROWS = 20;
export const PRODUCT_IMPORT_SHEET_PREVIEW_ISSUE_LIMIT = 8;
export const PRODUCT_IMPORT_SHEET_PREVIEW_COLUMN_LIMIT = 6;

export type ProductImportSheetPreviewBlock = "missing_identity" | "no_usable_rows";

export type ProductImportSheetPreviewColumn = {
  key: string;
  header: string;
};

export type ProductImportSheetPreviewRow = {
  rowNumber: number;
  cells: string[];
};

export type ProductImportSheetPreview = {
  fileName: string;
  rowCount: number;
  truncated: boolean;
  recognizedHeaders: string[];
  unknownColumns: string[];
  unsupportedColumns: string[];
  detectedOperations: ProductImportOperation[];
  selectedOperations: ProductImportOperation[];
  matchedOperations: ProductImportOperation[];
  issues: ProductImportIssue[];
  issueCount: number;
  columns: ProductImportSheetPreviewColumn[];
  sampleRows: ProductImportSheetPreviewRow[];
  blockedReason: ProductImportSheetPreviewBlock | null;
};

const IDENTITY_KEYS = ["handle", "sku", "product_id"] as const;

const DATA_KEYS: Array<{ key: string; operation: ProductImportOperation }> = [
  { key: "title", operation: "title" },
  { key: "body_html", operation: "descriptionHtml" },
  { key: "price", operation: "price" },
  { key: "cost", operation: "cost" },
  { key: "tags", operation: "tags" },
  { key: "status", operation: "status" },
  { key: "vendor", operation: "vendor" },
  { key: "product_type", operation: "productType" },
  { key: "seo_title", operation: "seoTitle" },
  { key: "seo_description", operation: "seoDescription" },
  { key: "new_handle", operation: "handle" },
  { key: "collection", operation: "collection" },
  { key: "duplicate", operation: "duplicate" },
  { key: "archive", operation: "archive" },
  { key: "delete", operation: "delete" },
];

export function isProductImportSheetPreviewBlocked(
  preview: Pick<ProductImportSheetPreview, "blockedReason">,
): boolean {
  return preview.blockedReason != null;
}

export function buildProductImportSheetPreview(args: {
  fileName: string;
  analysis: ProductImportSheetAnalysis;
  selectedOperations?: readonly string[];
}): ProductImportSheetPreview {
  const selected = coerceProductImportOperations(args.selectedOperations ?? args.analysis.operations);
  const columns = pickPreviewColumns(args.analysis, selected);
  const blockedReason = resolveBlockedReason(args.analysis);
  return {
    fileName: args.fileName,
    rowCount: args.analysis.records.length,
    truncated: args.analysis.truncated,
    recognizedHeaders: Object.values(args.analysis.mapping.columns),
    unknownColumns: args.analysis.mapping.unknown,
    unsupportedColumns: args.analysis.mapping.unsupported.map((item) => item.header),
    detectedOperations: detectImportOperations(
      args.analysis.mapping.columns,
      args.analysis.mapping.metafields,
    ),
    selectedOperations: selected,
    matchedOperations: args.analysis.operations,
    issues: args.analysis.issues.slice(0, PRODUCT_IMPORT_SHEET_PREVIEW_ISSUE_LIMIT),
    issueCount: args.analysis.issues.length,
    columns,
    sampleRows: args.analysis.records
      .slice(0, PRODUCT_IMPORT_SHEET_PREVIEW_SAMPLE_ROWS)
      .map((record) => ({
        rowNumber: record.rowNumber,
        cells: columns.map((column) => cellForColumn(record, column.key)),
      })),
    blockedReason,
  };
}

export function coerceProductImportSheetPreview(raw: unknown): ProductImportSheetPreview | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.fileName !== "string") return null;
  const columns = coerceColumns(record.columns);
  const sampleRows = coerceSampleRows(record.sampleRows, columns.length);
  const blockedReason = coerceBlockedReason(record.blockedReason);
  return {
    fileName: record.fileName,
    rowCount: toCount(record.rowCount),
    truncated: record.truncated === true,
    recognizedHeaders: coerceStringList(record.recognizedHeaders),
    unknownColumns: coerceStringList(record.unknownColumns),
    unsupportedColumns: coerceStringList(record.unsupportedColumns),
    detectedOperations: coerceProductImportOperations(record.detectedOperations),
    selectedOperations: coerceProductImportOperations(record.selectedOperations),
    matchedOperations: coerceProductImportOperations(record.matchedOperations),
    issues: coerceProductImportIssues(record.issues),
    issueCount: toCount(record.issueCount),
    columns,
    sampleRows,
    blockedReason,
  };
}

function resolveBlockedReason(analysis: ProductImportSheetAnalysis): ProductImportSheetPreviewBlock | null {
  const hasIdentity = IDENTITY_KEYS.some((key) => Boolean(analysis.mapping.columns[key]));
  if (!hasIdentity) return "missing_identity";
  if (analysis.records.length === 0) return "no_usable_rows";
  return null;
}

function pickPreviewColumns(
  analysis: ProductImportSheetAnalysis,
  selected: ProductImportOperation[],
): ProductImportSheetPreviewColumn[] {
  const columns: ProductImportSheetPreviewColumn[] = [];
  const selectedSet = new Set(selected);
  const push = (key: string, header: string | undefined) => {
    if (!header || columns.length >= PRODUCT_IMPORT_SHEET_PREVIEW_COLUMN_LIMIT) return;
    if (columns.some((column) => column.key === key)) return;
    columns.push({ key, header });
  };
  for (const key of IDENTITY_KEYS) push(key, analysis.mapping.columns[key]);
  for (const item of DATA_KEYS) {
    if (selectedSet.size > 0 && !selectedSet.has(item.operation)) continue;
    push(item.key, analysis.mapping.columns[item.key]);
  }
  if (selectedSet.has("metafield") || selectedSet.size === 0) {
    for (const metafield of analysis.mapping.metafields) {
      push(metafield.cellKey, metafield.header);
    }
  }
  return columns;
}

function cellForColumn(record: ProductImportRecord, key: string): string {
  if (key === "handle") return record.handle;
  if (key === "sku") return record.sku;
  if (key === "product_id") return record.productId;
  return record.cells[key] ?? "";
}

function coerceColumns(raw: unknown): ProductImportSheetPreviewColumn[] {
  if (!Array.isArray(raw)) return [];
  const columns: ProductImportSheetPreviewColumn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.key !== "string" || typeof record.header !== "string") continue;
    columns.push({ key: record.key, header: record.header });
  }
  return columns;
}

function coerceSampleRows(raw: unknown, columnCount: number): ProductImportSheetPreviewRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: ProductImportSheetPreviewRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const rowNumber = toCount(record.rowNumber);
    if (rowNumber <= 0 || !Array.isArray(record.cells)) continue;
    const cells = record.cells
      .filter((cell): cell is string => typeof cell === "string")
      .slice(0, columnCount || record.cells.length);
    rows.push({ rowNumber, cells });
  }
  return rows;
}

function coerceBlockedReason(raw: unknown): ProductImportSheetPreviewBlock | null {
  if (raw === "missing_identity" || raw === "no_usable_rows") return raw;
  return null;
}

function coerceStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function toCount(raw: unknown): number {
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}
