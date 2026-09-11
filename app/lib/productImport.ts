/**
 * 商品导入 — 表头识别、行校验、问题码。纯算，不含 IO。
 * 写回仍走各字段已有 apply；本文件只决定「文件里有什么、哪一行不合规」。
 */
import { toCsv } from "./csv";
import { SEO_DESCRIPTION_MAX_WIDTH, SEO_TITLE_MAX_WIDTH, seoDisplayWidth } from "./seoAudit";
import {
  isSupportedMetafieldType,
  parseImportMetafieldHeader,
  type ProductImportMetafieldColumn,
} from "./bulkMetafieldEdit";
import { isValidProductHandle, normalizeProductHandle } from "./bulkHandleEdit";
import { parseMoneyToCents } from "./bulkPriceEdit";

export const PRODUCT_IMPORT_SKILL_ID = "product_import";
export const PRODUCT_IMPORT_MAX_ROWS = 1000;
export const PRODUCT_IMPORT_MAX_PRODUCTS = 200;
export const PRODUCT_IMPORT_FILE_EXTENSIONS = [".csv", ".xlsx", ".xls"] as const;

export function isProductImportSpreadsheetName(filename: string): boolean {
  const lower = filename.trim().toLowerCase();
  return PRODUCT_IMPORT_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export const PRODUCT_IMPORT_OPERATIONS = [
  "title",
  "descriptionHtml",
  "price",
  "cost",
  "tags",
  "status",
  "vendor",
  "productType",
  "seoTitle",
  "seoDescription",
  "handle",
  "collection",
  "metafield",
  "duplicate",
  "archive",
  "delete",
] as const;
export type ProductImportOperation = (typeof PRODUCT_IMPORT_OPERATIONS)[number];

export const PRODUCT_IMPORT_OPERATION_GROUPS: Array<{
  key: "basic" | "pricing" | "seo" | "organize" | "bulk";
  operations: ProductImportOperation[];
}> = [
  {
    key: "basic",
    operations: ["title", "descriptionHtml", "vendor", "productType", "handle", "tags", "status"],
  },
  { key: "pricing", operations: ["price", "cost"] },
  { key: "seo", operations: ["seoTitle", "seoDescription"] },
  { key: "organize", operations: ["collection", "metafield"] },
  { key: "bulk", operations: ["duplicate", "archive", "delete"] },
];

export const PRODUCT_IMPORT_ISSUE_CODES = [
  "missing_identity",
  "no_supported_columns",
  "unsupported_column",
  "invalid_price",
  "price_needs_sku",
  "too_long_seo_title",
  "too_long_seo_description",
  "invalid_status",
  "invalid_collection_action",
  "invalid_cost",
  "cost_needs_sku",
  "invalid_handle",
  "handle_taken",
  "invalid_delete",
  "metafield_definition_missing",
  "metafield_type_unsupported",
  "metafield_invalid_value",
  "metafield_needs_sku",
  "inventory_not_in_v1",
  "create_fields_not_in_v1",
  "sku_not_found",
  "handle_not_found",
  "sku_matches_multiple",
  "collection_not_found",
  "collection_not_writable",
  "duplicate_over_limit",
  "missing_column_for_operation",
  "column_not_selected",
] as const;
export type ProductImportIssueCode = (typeof PRODUCT_IMPORT_ISSUE_CODES)[number];

export type ProductImportIssue = {
  rowNumber: number;
  code: ProductImportIssueCode;
  column?: string;
  value?: string;
};

const IDENTITY_COLUMNS = ["handle", "sku", "product_id"] as const;

const CANONICAL_ALIASES: Record<string, string> = {
  handle: "handle",
  sku: "sku",
  "variant sku": "sku",
  variant_sku: "sku",
  "variant sku code": "sku",
  id: "product_id",
  "product id": "product_id",
  product_id: "product_id",
  productid: "product_id",
  title: "title",
  "body (html)": "body_html",
  "body html": "body_html",
  body_html: "body_html",
  "new handle": "new_handle",
  new_handle: "new_handle",
  cost: "cost",
  "cost per item": "cost",
  "variant cost": "cost",
  price: "price",
  "variant price": "price",
  variant_price: "price",
  "compare at price": "compare_at",
  "variant compare at price": "compare_at",
  compare_at: "compare_at",
  compareatprice: "compare_at",
  vendor: "vendor",
  brand: "vendor",
  type: "product_type",
  "product type": "product_type",
  product_type: "product_type",
  "seo title": "seo_title",
  seo_title: "seo_title",
  "seo description": "seo_description",
  seo_description: "seo_description",
  tags: "tags",
  "add tags": "add_tags",
  add_tags: "add_tags",
  "remove tags": "remove_tags",
  remove_tags: "remove_tags",
  status: "status",
  collection: "collection",
  collections: "collection",
  "collection action": "collection_action",
  collection_action: "collection_action",
  duplicate: "duplicate",
  "title suffix": "duplicate_suffix",
  duplicate_suffix: "duplicate_suffix",
  "new status": "duplicate_status",
  duplicate_status: "duplicate_status",
  "include images": "duplicate_images",
  duplicate_images: "duplicate_images",
  archive: "archive",
  delete: "delete",
  "delete product": "delete",
};

const UNSUPPORTED_REASON: Record<string, ProductImportIssueCode> = {
  published: "create_fields_not_in_v1",
  "option1 name": "create_fields_not_in_v1",
  "option1 value": "create_fields_not_in_v1",
  "option2 name": "create_fields_not_in_v1",
  "option2 value": "create_fields_not_in_v1",
  "option3 name": "create_fields_not_in_v1",
  "option3 value": "create_fields_not_in_v1",
  "variant barcode": "create_fields_not_in_v1",
  "image src": "create_fields_not_in_v1",
  inventory: "inventory_not_in_v1",
  "inventory qty": "inventory_not_in_v1",
  "on hand": "inventory_not_in_v1",
  quantity: "inventory_not_in_v1",
};

export type ProductImportHeaderMapping = {
  columns: Record<string, string>;
  metafields: ProductImportMetafieldColumn[];
  unsupported: Array<{ header: string; code: ProductImportIssueCode }>;
  unknown: string[];
};

export function normalizeImportHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_/]+/g, " ").replace(/\s+/g, " ");
}

export function mapImportHeaders(headers: string[]): ProductImportHeaderMapping {
  const columns: Record<string, string> = {};
  const metafields: ProductImportMetafieldColumn[] = [];
  const unsupported: Array<{ header: string; code: ProductImportIssueCode }> = [];
  const unknown: string[] = [];
  const seenUnsupported = new Set<string>();
  const seenMetafields = new Set<string>();

  for (const header of headers) {
    const trimmed = header.trim();
    if (!trimmed) continue;
    const metafield = parseImportMetafieldHeader(trimmed);
    if (metafield) {
      if (metafield.type && !isSupportedMetafieldType(metafield.type)) {
        if (!seenUnsupported.has(metafield.cellKey)) {
          seenUnsupported.add(metafield.cellKey);
          unsupported.push({ header: trimmed, code: "metafield_type_unsupported" });
        }
        continue;
      }
      if (!seenMetafields.has(metafield.cellKey)) {
        seenMetafields.add(metafield.cellKey);
        metafields.push(metafield);
      }
      continue;
    }
    const normalized = normalizeImportHeader(trimmed);
    const canonical = CANONICAL_ALIASES[normalized];
    if (canonical) {
      if (!columns[canonical]) columns[canonical] = trimmed;
      continue;
    }
    const unsupportedCode = UNSUPPORTED_REASON[normalized];
    if (unsupportedCode) {
      if (!seenUnsupported.has(normalized)) {
        seenUnsupported.add(normalized);
        unsupported.push({ header: trimmed, code: unsupportedCode });
      }
      continue;
    }
    unknown.push(trimmed);
  }
  return { columns, metafields, unsupported, unknown };
}

export type ProductImportRecord = {
  rowNumber: number;
  handle: string;
  sku: string;
  productId: string;
  cells: Record<string, string>;
};

function cellAt(row: string[], index: number | undefined): string {
  if (index == null || index < 0) return "";
  return (row[index] ?? "").trim();
}

export function forwardFillIdentity(rows: ProductImportRecord[]): ProductImportRecord[] {
  let lastHandle = "";
  let lastProductId = "";
  return rows.map((row) => {
    const handle = row.handle || lastHandle;
    const productId = row.productId || lastProductId;
    if (row.handle) lastHandle = row.handle;
    if (row.productId) lastProductId = row.productId;
    return { ...row, handle, productId };
  });
}

export function hasIdentity(record: Pick<ProductImportRecord, "handle" | "sku" | "productId">): boolean {
  return Boolean(record.handle || record.sku || record.productId);
}

const OPERATION_COLUMNS: Record<ProductImportOperation, string[]> = {
  title: ["title"],
  descriptionHtml: ["body_html"],
  price: ["price", "compare_at"],
  cost: ["cost"],
  tags: ["tags", "add_tags", "remove_tags"],
  status: ["status"],
  vendor: ["vendor"],
  productType: ["product_type"],
  seoTitle: ["seo_title"],
  seoDescription: ["seo_description"],
  handle: ["new_handle"],
  collection: ["collection"],
  metafield: [],
  duplicate: ["duplicate"],
  archive: ["archive"],
  delete: ["delete"],
};

export function detectImportOperations(
  columns: Record<string, string>,
  metafields: ProductImportMetafieldColumn[] = [],
): ProductImportOperation[] {
  return PRODUCT_IMPORT_OPERATIONS.filter((operation) => {
    if (operation === "metafield") return metafields.length > 0;
    return OPERATION_COLUMNS[operation].some((column) => Boolean(columns[column]));
  });
}

function operationHeaders(
  mapping: ProductImportHeaderMapping,
  operation: ProductImportOperation,
): string[] {
  if (operation === "metafield") return mapping.metafields.map((item) => item.header);
  return OPERATION_COLUMNS[operation]
    .map((column) => mapping.columns[column])
    .filter((header): header is string => Boolean(header));
}

/** 商户勾选 ∩ 表头检出：只把选中的子功能交给对应模块。 */
export function filterImportOperationsForSelection(args: {
  detected: ProductImportOperation[];
  selected: readonly string[];
  mapping: ProductImportHeaderMapping;
}): { operations: ProductImportOperation[]; issues: ProductImportIssue[] } {
  const selected = coerceProductImportOperations(args.selected);
  const selectedSet = new Set(selected);
  const operations = args.detected.filter((operation) => selectedSet.has(operation));
  const issues: ProductImportIssue[] = [];
  for (const operation of selected) {
    if (args.detected.includes(operation)) continue;
    issues.push({
      rowNumber: 0,
      code: "missing_column_for_operation",
      column: operationHeaders(args.mapping, operation)[0] ?? operation,
      value: operation,
    });
  }
  for (const operation of args.detected) {
    if (selectedSet.has(operation)) continue;
    for (const column of operationHeaders(args.mapping, operation)) {
      issues.push({ rowNumber: 0, code: "column_not_selected", column, value: operation });
    }
  }
  return { operations, issues };
}

export function parseImportStatus(raw: string): "ACTIVE" | "DRAFT" | "ARCHIVED" | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value === "active" || value === "上架") return "ACTIVE";
  if (value === "draft" || value === "草稿") return "DRAFT";
  if (value === "archived" || value === "archive" || value === "归档") return "ARCHIVED";
  return null;
}

export function parseImportBool(raw: string): boolean | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (["1", "true", "yes", "y", "是"].includes(value)) return true;
  if (["0", "false", "no", "n", "否"].includes(value)) return false;
  return null;
}

export function parseImportTags(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseImportCollectionAction(raw: string): "add" | "remove" | null {
  const value = raw.trim().toLowerCase();
  if (!value) return "add";
  if (["add", "加入", "include"].includes(value)) return "add";
  if (["remove", "移出", "exclude"].includes(value)) return "remove";
  return null;
}

export type ProductImportSheetAnalysis = {
  mapping: ProductImportHeaderMapping;
  operations: ProductImportOperation[];
  records: ProductImportRecord[];
  issues: ProductImportIssue[];
  truncated: boolean;
};

export function analyzeImportSheet(
  headers: string[],
  rows: string[][],
  selectedOperations?: readonly string[],
): ProductImportSheetAnalysis {
  const mapping = mapImportHeaders(headers);
  const headerIndex = new Map<string, number>();
  headers.forEach((header, index) => {
    const trimmed = header.trim();
    if (trimmed && !headerIndex.has(trimmed)) headerIndex.set(trimmed, index);
  });
  const columnIndex = (canonical: string): number | undefined => {
    const source = mapping.columns[canonical];
    return source ? headerIndex.get(source) : undefined;
  };

  const issues: ProductImportIssue[] = [
    ...mapping.unsupported.map((item) => ({
      rowNumber: 0,
      code: item.code,
      column: item.header,
    })),
    ...mapping.unknown.map((header) => ({
      rowNumber: 0,
      code: "unsupported_column" as const,
      column: header,
    })),
  ];

  const detected = detectImportOperations(mapping.columns, mapping.metafields);
  const selected =
    selectedOperations === undefined ? undefined : coerceProductImportOperations(selectedOperations);
  const filtered =
    selected === undefined
      ? { operations: detected, issues: [] as ProductImportIssue[] }
      : filterImportOperationsForSelection({
          detected,
          selected,
          mapping,
        });
  const operations = filtered.operations;
  issues.push(...filtered.issues);
  if (selected === undefined && operations.length === 0) {
    issues.push({ rowNumber: 0, code: "no_supported_columns" });
  }

  const identityReady = IDENTITY_COLUMNS.some((column) => Boolean(mapping.columns[column]));
  if (!identityReady) {
    issues.push({ rowNumber: 0, code: "missing_identity" });
  }

  const limited = rows.slice(0, PRODUCT_IMPORT_MAX_ROWS);
  const truncated = rows.length > PRODUCT_IMPORT_MAX_ROWS;
  const records: ProductImportRecord[] = [];
  limited.forEach((row, index) => {
    const rowNumber = index + 2;
    const allBlank = row.every((cell) => !String(cell ?? "").trim());
    if (allBlank) return;
    const cells: Record<string, string> = {
      title: cellAt(row, columnIndex("title")),
      body_html: cellAt(row, columnIndex("body_html")),
      price: cellAt(row, columnIndex("price")),
      compare_at: cellAt(row, columnIndex("compare_at")),
      cost: cellAt(row, columnIndex("cost")),
      vendor: cellAt(row, columnIndex("vendor")),
      product_type: cellAt(row, columnIndex("product_type")),
      seo_title: cellAt(row, columnIndex("seo_title")),
      seo_description: cellAt(row, columnIndex("seo_description")),
      new_handle: cellAt(row, columnIndex("new_handle")),
      tags: cellAt(row, columnIndex("tags")),
      add_tags: cellAt(row, columnIndex("add_tags")),
      remove_tags: cellAt(row, columnIndex("remove_tags")),
      status: cellAt(row, columnIndex("status")),
      collection: cellAt(row, columnIndex("collection")),
      collection_action: cellAt(row, columnIndex("collection_action")),
      duplicate: cellAt(row, columnIndex("duplicate")),
      duplicate_suffix: cellAt(row, columnIndex("duplicate_suffix")),
      duplicate_status: cellAt(row, columnIndex("duplicate_status")),
      duplicate_images: cellAt(row, columnIndex("duplicate_images")),
      archive: cellAt(row, columnIndex("archive")),
      delete: cellAt(row, columnIndex("delete")),
    };
    for (const metafield of mapping.metafields) {
      cells[metafield.cellKey] = cellAt(row, headerIndex.get(metafield.header));
    }
    records.push({
      rowNumber,
      handle: cellAt(row, columnIndex("handle")),
      sku: cellAt(row, columnIndex("sku")),
      productId: cellAt(row, columnIndex("product_id")),
      cells,
    });
  });

  const filled = forwardFillIdentity(records);
  for (const record of filled) {
    if (!hasIdentity(record)) {
      issues.push({ rowNumber: record.rowNumber, code: "missing_identity" });
    }
    issues.push(...validateImportRecord(record, operations, mapping.metafields));
  }

  return { mapping, operations, records: filled, issues, truncated };
}

export function validateImportRecord(
  record: ProductImportRecord,
  operations: ProductImportOperation[],
  metafields: ProductImportMetafieldColumn[] = [],
): ProductImportIssue[] {
  const issues: ProductImportIssue[] = [];
  const { cells, rowNumber } = record;
  if (operations.includes("price") && cells.price && parseMoneyToCents(cells.price.replace(/,/g, "")) == null) {
    issues.push({ rowNumber, code: "invalid_price", column: "price", value: cells.price });
  }
  if (operations.includes("price") && cells.compare_at && parseMoneyToCents(cells.compare_at.replace(/,/g, "")) == null) {
    issues.push({ rowNumber, code: "invalid_price", column: "compare_at", value: cells.compare_at });
  }
  if (operations.includes("cost") && cells.cost && parseMoneyToCents(cells.cost.replace(/,/g, "")) == null) {
    issues.push({ rowNumber, code: "invalid_cost", column: "cost", value: cells.cost });
  }
  if (operations.includes("seoTitle") && cells.seo_title && seoDisplayWidth(cells.seo_title) > SEO_TITLE_MAX_WIDTH) {
    issues.push({ rowNumber, code: "too_long_seo_title", column: "seo_title", value: cells.seo_title });
  }
  if (
    operations.includes("seoDescription") &&
    cells.seo_description &&
    seoDisplayWidth(cells.seo_description) > SEO_DESCRIPTION_MAX_WIDTH
  ) {
    issues.push({
      rowNumber,
      code: "too_long_seo_description",
      column: "seo_description",
      value: cells.seo_description,
    });
  }
  if (operations.includes("status") && cells.status && parseImportStatus(cells.status) == null) {
    issues.push({ rowNumber, code: "invalid_status", column: "status", value: cells.status });
  }
  if (operations.includes("handle") && cells.new_handle && !isValidProductHandle(normalizeProductHandle(cells.new_handle))) {
    issues.push({ rowNumber, code: "invalid_handle", column: "new_handle", value: cells.new_handle });
  }
  if (operations.includes("delete") && cells.delete && parseImportBool(cells.delete) == null) {
    issues.push({ rowNumber, code: "invalid_delete", column: "delete", value: cells.delete });
  }
  if (operations.includes("collection") && cells.collection) {
    const action = parseImportCollectionAction(cells.collection_action);
    if (action == null) {
      issues.push({
        rowNumber,
        code: "invalid_collection_action",
        column: "collection_action",
        value: cells.collection_action,
      });
    }
  }
  if (operations.includes("metafield")) {
    for (const metafield of metafields) {
      const value = cells[metafield.cellKey];
      if (!value) continue;
      if (metafield.owner === "variant" && !record.sku) {
        issues.push({ rowNumber, code: "metafield_needs_sku", column: metafield.header, value });
      }
    }
  }
  return issues;
}

export function rowHasBlockingIssue(issues: ProductImportIssue[], rowNumber: number): boolean {
  return issues.some((issue) => issue.rowNumber === rowNumber);
}

export function buildProductImportIssueCsv(
  issues: ProductImportIssue[],
  label: (code: ProductImportIssueCode) => string,
  fix: (code: ProductImportIssueCode) => string,
): string {
  return toCsv(
    ["row", "column", "code", "value", "problem", "how_to_fix"] as const,
    issues.map((issue) => [
      issue.rowNumber > 0 ? String(issue.rowNumber) : "",
      issue.column ?? "",
      issue.code,
      issue.value ?? "",
      label(issue.code),
      fix(issue.code),
    ]),
  );
}

export function coerceProductImportIssues(raw: unknown): ProductImportIssue[] {
  if (!Array.isArray(raw)) return [];
  const codes = new Set<string>(PRODUCT_IMPORT_ISSUE_CODES);
  const out: ProductImportIssue[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const code = typeof record.code === "string" ? record.code : "";
    if (!codes.has(code)) continue;
    const rowNumber = typeof record.rowNumber === "number" ? record.rowNumber : Number(record.rowNumber);
    out.push({
      rowNumber: Number.isFinite(rowNumber) ? rowNumber : 0,
      code: code as ProductImportIssueCode,
      ...(typeof record.column === "string" ? { column: record.column } : {}),
      ...(typeof record.value === "string" ? { value: record.value } : {}),
    });
  }
  return out;
}

export function coerceProductImportOperations(raw: unknown): ProductImportOperation[] {
  const values = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/[,，]/)
      : [];
  const allowed = new Set<string>(PRODUCT_IMPORT_OPERATIONS);
  const seen = new Set<ProductImportOperation>();
  for (const item of values) {
    if (typeof item !== "string") continue;
    const value = item.trim() as ProductImportOperation;
    if (!allowed.has(value) || seen.has(value)) continue;
    seen.add(value);
  }
  return PRODUCT_IMPORT_OPERATIONS.filter((operation) => seen.has(operation));
}

export function serializeImportOperations(raw: unknown): string {
  return coerceProductImportOperations(raw).join(",");
}
