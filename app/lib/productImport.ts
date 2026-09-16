/**
 * 商品导入 — 表头识别、行校验、问题码。纯算，不含 IO。
 * 写回仍走各字段已有 apply；本文件只决定「文件里有什么、哪一行不合规」。
 */
import { toCsv } from "./csv";
import {
  isSupportedMetafieldType,
  parseImportMetafieldHeader,
  type ProductImportMetafieldColumn,
} from "./bulkMetafieldEdit";
import { isValidProductHandle, normalizeProductHandle } from "./bulkHandleEdit";
import { parseMoneyToCents } from "./bulkPriceEdit";
import {
  SHOPIFY_PRODUCT_TITLE_MAX_LENGTH,
  SHOPIFY_SEO_DESCRIPTION_MAX_CHARS,
  SHOPIFY_SEO_TITLE_MAX_CHARS,
} from "./bulkProductFieldEdit";
import { BULK_TAG_EDIT_MAX_TAG_LENGTH } from "./bulkTagEdit";

export const PRODUCT_IMPORT_SKILL_ID = "product_import";
export const PRODUCT_IMPORT_MAX_FILE_BYTES = 15 * 1024 * 1024;
export const PRODUCT_IMPORT_WORK_CHUNK_PRODUCTS = 200;
export const PRODUCT_IMPORT_REVIEW_ROW_LIMIT = 100;
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
  "sku",
  "barcode",
  "weight",
  "duplicate",
  "archive",
  "delete",
] as const;
export type ProductImportOperation = (typeof PRODUCT_IMPORT_OPERATIONS)[number];

export const PRODUCT_IMPORT_OPERATION_GROUPS: Array<{
  key: "basic" | "pricing" | "identity" | "seo" | "organize" | "bulk";
  operations: ProductImportOperation[];
}> = [
  {
    key: "basic",
    operations: ["title", "descriptionHtml", "vendor", "productType", "handle", "tags", "status"],
  },
  { key: "pricing", operations: ["price", "cost"] },
  { key: "identity", operations: ["sku", "barcode", "weight"] },
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
  "identity_needs_sku",
  "sku_is_identity_only",
  "invalid_weight",
  "inventory_not_in_v1",
  "create_fields_not_in_v1",
  "sku_not_found",
  "handle_not_found",
  "product_id_not_found",
  "sku_matches_multiple",
  "collection_not_found",
  "collection_not_writable",
  "duplicate_over_limit",
  "too_many_products",
  "missing_column_for_operation",
  "column_not_selected",
  "too_long_title",
  "empty_title",
  "tag_too_long",
  "too_many_tags",
] as const;
export type ProductImportIssueCode = (typeof PRODUCT_IMPORT_ISSUE_CODES)[number];

/** 不阻断写回、也不进「需修改」的说明项（一期不支持列、未勾选列等）。 */
const PRODUCT_IMPORT_INFO_ISSUE_CODES = new Set<ProductImportIssueCode>([
  "column_not_selected",
  "inventory_not_in_v1",
  "create_fields_not_in_v1",
  "unsupported_column",
]);

export function isActionableImportIssue(code: ProductImportIssueCode): boolean {
  return !PRODUCT_IMPORT_INFO_ISSUE_CODES.has(code);
}

export function filterActionableImportIssues(issues: ProductImportIssue[]): ProductImportIssue[] {
  return issues.filter((issue) => isActionableImportIssue(issue.code));
}

export const PRODUCT_IMPORT_REVIEW_SAMPLE_LIMIT = 5;

export type ProductImportIssue = {
  rowNumber: number;
  code: ProductImportIssueCode;
  column?: string;
  value?: string;
  productTitle?: string;
  rowLabel?: string;
};

export function formatImportIssueRowLabel(rowNumbers: number[]): string {
  const rows = [...new Set(rowNumbers.filter((row) => row > 0))].sort((a, b) => a - b);
  if (rows.length === 0) return "";
  const first = rows[0] ?? 0;
  const last = rows[rows.length - 1] ?? first;
  const consecutive = rows.length === last - first + 1;
  if (consecutive && rows.length > 1) return `${first}–${last}`;
  return rows.map(String).join(", ");
}

export function collapseRepeatedImportIssues(issues: ProductImportIssue[]): ProductImportIssue[] {
  const handleRows = new Map<string, number[]>();
  for (const issue of issues) {
    if (issue.code !== "handle_not_found") continue;
    const key = (issue.value ?? "").toLowerCase();
    const rows = handleRows.get(key) ?? [];
    rows.push(issue.rowNumber);
    handleRows.set(key, rows);
  }
  const seenHandles = new Set<string>();
  const out: ProductImportIssue[] = [];
  for (const issue of issues) {
    if (issue.code !== "handle_not_found") {
      out.push(issue);
      continue;
    }
    const key = (issue.value ?? "").toLowerCase();
    if (seenHandles.has(key)) continue;
    seenHandles.add(key);
    const rows = handleRows.get(key) ?? [issue.rowNumber];
    const rowLabel = formatImportIssueRowLabel(rows);
    out.push({
      ...issue,
      rowNumber: rows[0] ?? issue.rowNumber,
      ...(rowLabel ? { rowLabel } : {}),
    });
  }
  return out;
}

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
  "option1 value": "option1",
  "option2 value": "option2",
  "option3 value": "option3",
  "body (html)": "body_html",
  "body html": "body_html",
  body_html: "body_html",
  "new handle": "new_handle",
  new_handle: "new_handle",
  "new sku": "new_sku",
  new_sku: "new_sku",
  barcode: "barcode",
  "variant barcode": "barcode",
  "variant barcodes": "barcode",
  grams: "grams",
  "variant grams": "grams",
  "variant weight": "grams",
  "weight unit": "weight_unit",
  "variant weight unit": "weight_unit",
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
  "image src": "create_fields_not_in_v1",
  inventory: "inventory_not_in_v1",
  "inventory qty": "inventory_not_in_v1",
  "variant inventory qty": "inventory_not_in_v1",
  "inventory quantity": "inventory_not_in_v1",
  "variant inventory quantity": "inventory_not_in_v1",
  "on hand": "inventory_not_in_v1",
  quantity: "inventory_not_in_v1",
};

/** Shopify 导出里有、本期不写回、也不当问题行的列。 */
const IGNORED_NATIVE_HEADERS = new Set([
  "product category",
  "option1 name",
  "option2 name",
  "option3 name",
  "option1 linked to",
  "option2 linked to",
  "option3 linked to",
  "variant inventory tracker",
  "variant inventory policy",
  "variant fulfillment service",
  "variant requires shipping",
  "variant taxable",
  "image position",
  "image alt text",
  "gift card",
  "variant image",
  "variant tax code",
]);

function isIgnoredNativeHeader(normalized: string): boolean {
  if (IGNORED_NATIVE_HEADERS.has(normalized)) return true;
  return normalized.startsWith("google shopping ") || normalized.startsWith("unit price ");
}

const PRODUCT_IMPORT_UNSUGGESTED_OPERATIONS = new Set<ProductImportOperation>([
  "sku",
  "duplicate",
  "archive",
  "delete",
]);

export type ProductImportHeaderMapping = {
  columns: Record<string, string>;
  metafields: ProductImportMetafieldColumn[];
  unsupported: Array<{ header: string; code: ProductImportIssueCode }>;
  ignored: string[];
  unknown: string[];
};

export function normalizeImportHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_/]+/g, " ").replace(/\s+/g, " ");
}

export function mapImportHeaders(headers: string[]): ProductImportHeaderMapping {
  const columns: Record<string, string> = {};
  const metafields: ProductImportMetafieldColumn[] = [];
  const unsupported: Array<{ header: string; code: ProductImportIssueCode }> = [];
  const ignored: string[] = [];
  const unknown: string[] = [];
  const seenUnsupported = new Set<string>();
  const seenIgnored = new Set<string>();
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
    if (isIgnoredNativeHeader(normalized)) {
      if (!seenIgnored.has(normalized)) {
        seenIgnored.add(normalized);
        ignored.push(trimmed);
      }
      continue;
    }
    unknown.push(trimmed);
  }
  return { columns, metafields, unsupported, ignored, unknown };
}

export type ProductImportRecord = {
  rowNumber: number;
  handle: string;
  sku: string;
  productId: string;
  option1: string;
  option2: string;
  option3: string;
  cells: Record<string, string>;
};

/** Shopify 导出给 Excel 用的前导撇号，匹配 / 解析数字前去掉。 */
export function stripExcelTextPrefix(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("'") && trimmed.length > 1) return trimmed.slice(1).trim();
  return trimmed;
}

export function normalizeImportSku(raw: string): string {
  return stripExcelTextPrefix(raw);
}

export function hasOptionIdentity(
  record: Pick<ProductImportRecord, "option1" | "option2" | "option3">,
): boolean {
  return Boolean(record.option1 || record.option2 || record.option3);
}

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
  sku: ["sku", "new_sku"],
  barcode: ["barcode"],
  weight: ["grams"],
  duplicate: ["duplicate"],
  archive: ["archive"],
  delete: ["delete"],
};

/** 勾选即整表生效；列只作逐行开关。删除仍须审核页二次确认。 */
const SELECTION_DEFAULTS_TRUE_OPERATIONS = new Set<ProductImportOperation>([
  "duplicate",
  "archive",
  "delete",
]);
const SELECTION_DEFAULT_HEADERS: Partial<Record<ProductImportOperation, string>> = {
  duplicate: "Duplicate",
  archive: "Archive",
  delete: "Delete",
};
const SELECTION_DEFAULT_CELL = "TRUE";

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

function operationAllowsMissingColumn(operation: ProductImportOperation): boolean {
  return SELECTION_DEFAULTS_TRUE_OPERATIONS.has(operation);
}

function applySelectionDefaults(
  mapping: ProductImportHeaderMapping,
  records: ProductImportRecord[],
  operations: readonly ProductImportOperation[],
): void {
  for (const operation of SELECTION_DEFAULTS_TRUE_OPERATIONS) {
    if (!operations.includes(operation)) continue;
    const column = OPERATION_COLUMNS[operation][0];
    const header = SELECTION_DEFAULT_HEADERS[operation];
    if (!column || !header || mapping.columns[column]) continue;
    mapping.columns[column] = header;
    for (const record of records) {
      record.cells[column] = SELECTION_DEFAULT_CELL;
    }
  }
}

/** 商户勾选 ∩ 表头检出：只把选中的子功能交给对应模块。 */
export function filterImportOperationsForSelection(args: {
  detected: ProductImportOperation[];
  selected: readonly string[];
  mapping: ProductImportHeaderMapping;
}): { operations: ProductImportOperation[]; issues: ProductImportIssue[] } {
  const selected = coerceProductImportOperations(args.selected);
  const selectedSet = new Set(selected);
  const detectedSet = new Set(args.detected);
  const operations = PRODUCT_IMPORT_OPERATIONS.filter((operation) => {
    if (!selectedSet.has(operation)) return false;
    return detectedSet.has(operation) || operationAllowsMissingColumn(operation);
  });
  const issues: ProductImportIssue[] = [];
  for (const operation of selected) {
    if (detectedSet.has(operation) || operationAllowsMissingColumn(operation)) continue;
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

  const truncated = false;
  const records: ProductImportRecord[] = [];
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const allBlank = row.every((cell) => !String(cell ?? "").trim());
    if (allBlank) return;
    const cells: Record<string, string> = {
      title: cellAt(row, columnIndex("title")),
      body_html: cellAt(row, columnIndex("body_html")),
      price: stripExcelTextPrefix(cellAt(row, columnIndex("price"))),
      compare_at: stripExcelTextPrefix(cellAt(row, columnIndex("compare_at"))),
      cost: stripExcelTextPrefix(cellAt(row, columnIndex("cost"))),
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
      new_sku: normalizeImportSku(cellAt(row, columnIndex("new_sku"))),
      barcode: stripExcelTextPrefix(cellAt(row, columnIndex("barcode"))),
      grams: stripExcelTextPrefix(cellAt(row, columnIndex("grams"))),
      weight_unit: cellAt(row, columnIndex("weight_unit")),
    };
    for (const metafield of mapping.metafields) {
      cells[metafield.cellKey] = cellAt(row, headerIndex.get(metafield.header));
    }
    records.push({
      rowNumber,
      handle: cellAt(row, columnIndex("handle")),
      sku: normalizeImportSku(cellAt(row, columnIndex("sku"))),
      productId: stripExcelTextPrefix(cellAt(row, columnIndex("product_id"))),
      option1: stripExcelTextPrefix(cellAt(row, columnIndex("option1"))),
      option2: stripExcelTextPrefix(cellAt(row, columnIndex("option2"))),
      option3: stripExcelTextPrefix(cellAt(row, columnIndex("option3"))),
      cells,
    });
  });

  applySelectionDefaults(mapping, records, operations);
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
  if (operations.includes("title") && cells.title && cells.title.length > SHOPIFY_PRODUCT_TITLE_MAX_LENGTH) {
    issues.push({ rowNumber, code: "too_long_title", column: "title", value: cells.title });
  }
  if (operations.includes("price") && cells.price && parseMoneyToCents(cells.price.replace(/,/g, "")) == null) {
    issues.push({ rowNumber, code: "invalid_price", column: "price", value: cells.price });
  }
  if (operations.includes("price") && cells.compare_at && parseMoneyToCents(cells.compare_at.replace(/,/g, "")) == null) {
    issues.push({ rowNumber, code: "invalid_price", column: "compare_at", value: cells.compare_at });
  }
  if (operations.includes("cost") && cells.cost && parseMoneyToCents(cells.cost.replace(/,/g, "")) == null) {
    issues.push({ rowNumber, code: "invalid_cost", column: "cost", value: cells.cost });
  }
  if (operations.includes("seoTitle") && cells.seo_title && cells.seo_title.length > SHOPIFY_SEO_TITLE_MAX_CHARS) {
    issues.push({ rowNumber, code: "too_long_seo_title", column: "seo_title", value: cells.seo_title });
  }
  if (
    operations.includes("seoDescription") &&
    cells.seo_description &&
    cells.seo_description.length > SHOPIFY_SEO_DESCRIPTION_MAX_CHARS
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
  if (operations.includes("weight") && cells.grams) {
    const grams = Number(stripExcelTextPrefix(cells.grams).replace(/,/g, ""));
    if (!Number.isFinite(grams) || grams < 0) {
      issues.push({ rowNumber, code: "invalid_weight", column: "grams", value: cells.grams });
    }
  }
  if (operations.includes("tags")) {
    const tagColumn = cells.tags ? "tags" : cells.add_tags ? "add_tags" : "tags";
    const tags = parseImportTags(cells.tags || cells.add_tags);
    for (const tag of tags) {
      if (tag.length > BULK_TAG_EDIT_MAX_TAG_LENGTH) {
        issues.push({ rowNumber, code: "tag_too_long", column: tagColumn, value: tag });
      }
    }
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
      if (metafield.owner === "variant" && !record.sku && !hasOptionIdentity(record)) {
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
      issue.rowLabel || (issue.rowNumber > 0 ? String(issue.rowNumber) : ""),
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
      ...(typeof record.productTitle === "string" && record.productTitle.trim()
        ? { productTitle: record.productTitle }
        : {}),
      ...(typeof record.rowLabel === "string" && record.rowLabel.trim()
        ? { rowLabel: record.rowLabel }
        : {}),
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

/** 上传后建议勾选检出列；复制/归档/删除必须商户自己勾。 */
export function suggestImportOperations(
  detected: readonly ProductImportOperation[],
): ProductImportOperation[] {
  return detected.filter((operation) => !PRODUCT_IMPORT_UNSUGGESTED_OPERATIONS.has(operation));
}

export function serializeImportOperations(raw: unknown): string {
  return coerceProductImportOperations(raw).join(",");
}
