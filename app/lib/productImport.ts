/**
 * 商品导入 — 表头识别、行校验、问题码。纯算，不含 IO。
 * 写回仍走各字段已有 apply；本文件只决定「文件里有什么、哪一行不合规」。
 */
import { toCsv } from "./csv";
import { SEO_DESCRIPTION_MAX_WIDTH, SEO_TITLE_MAX_WIDTH, seoDisplayWidth } from "./seoAudit";

export const PRODUCT_IMPORT_SKILL_ID = "product_import";
export const PRODUCT_IMPORT_MAX_ROWS = 1000;
export const PRODUCT_IMPORT_MAX_PRODUCTS = 200;

export const PRODUCT_IMPORT_OPERATIONS = [
  "price",
  "tags",
  "status",
  "vendor",
  "productType",
  "seoTitle",
  "seoDescription",
  "collection",
  "duplicate",
  "archive",
] as const;
export type ProductImportOperation = (typeof PRODUCT_IMPORT_OPERATIONS)[number];

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
  "handle_not_in_v1",
  "cost_not_in_v1",
  "metafield_not_in_v1",
  "delete_not_in_v1",
  "inventory_not_in_v1",
  "create_fields_not_in_v1",
  "sku_not_found",
  "handle_not_found",
  "sku_matches_multiple",
  "collection_not_found",
  "collection_not_writable",
  "duplicate_over_limit",
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
};

const UNSUPPORTED_REASON: Record<string, ProductImportIssueCode> = {
  title: "create_fields_not_in_v1",
  "body (html)": "create_fields_not_in_v1",
  "body html": "create_fields_not_in_v1",
  "body_html": "create_fields_not_in_v1",
  published: "create_fields_not_in_v1",
  "option1 name": "create_fields_not_in_v1",
  "option1 value": "create_fields_not_in_v1",
  "option2 name": "create_fields_not_in_v1",
  "option2 value": "create_fields_not_in_v1",
  "option3 name": "create_fields_not_in_v1",
  "option3 value": "create_fields_not_in_v1",
  "variant barcode": "create_fields_not_in_v1",
  "image src": "create_fields_not_in_v1",
  "new handle": "handle_not_in_v1",
  new_handle: "handle_not_in_v1",
  cost: "cost_not_in_v1",
  "cost per item": "cost_not_in_v1",
  "variant cost": "cost_not_in_v1",
  inventory: "inventory_not_in_v1",
  "inventory qty": "inventory_not_in_v1",
  "on hand": "inventory_not_in_v1",
  quantity: "inventory_not_in_v1",
  delete: "delete_not_in_v1",
  "delete product": "delete_not_in_v1",
};

export type ProductImportHeaderMapping = {
  /** canonical → 原列表头 */
  columns: Record<string, string>;
  unsupported: Array<{ header: string; code: ProductImportIssueCode }>;
  unknown: string[];
};

export function normalizeImportHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_/]+/g, " ").replace(/\s+/g, " ");
}

export function mapImportHeaders(headers: string[]): ProductImportHeaderMapping {
  const columns: Record<string, string> = {};
  const unsupported: Array<{ header: string; code: ProductImportIssueCode }> = [];
  const unknown: string[] = [];
  const seenUnsupported = new Set<string>();

  for (const header of headers) {
    const trimmed = header.trim();
    if (!trimmed) continue;
    const normalized = normalizeImportHeader(trimmed);
    if (normalized.startsWith("metafield") || normalized.includes(" metafield")) {
      if (!seenUnsupported.has("metafield")) {
        seenUnsupported.add("metafield");
        unsupported.push({ header: trimmed, code: "metafield_not_in_v1" });
      }
      continue;
    }
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
  return { columns, unsupported, unknown };
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
  price: ["price", "compare_at"],
  tags: ["tags", "add_tags", "remove_tags"],
  status: ["status"],
  vendor: ["vendor"],
  productType: ["product_type"],
  seoTitle: ["seo_title"],
  seoDescription: ["seo_description"],
  collection: ["collection"],
  duplicate: ["duplicate"],
  archive: ["archive"],
};

export function detectImportOperations(columns: Record<string, string>): ProductImportOperation[] {
  return PRODUCT_IMPORT_OPERATIONS.filter((operation) =>
    OPERATION_COLUMNS[operation].some((column) => Boolean(columns[column])),
  );
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

export function analyzeImportSheet(headers: string[], rows: string[][]): ProductImportSheetAnalysis {
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

  const operations = detectImportOperations(mapping.columns);
  if (operations.length === 0) {
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
    records.push({
      rowNumber,
      handle: cellAt(row, columnIndex("handle")),
      sku: cellAt(row, columnIndex("sku")),
      productId: cellAt(row, columnIndex("product_id")),
      cells: {
        price: cellAt(row, columnIndex("price")),
        compare_at: cellAt(row, columnIndex("compare_at")),
        vendor: cellAt(row, columnIndex("vendor")),
        product_type: cellAt(row, columnIndex("product_type")),
        seo_title: cellAt(row, columnIndex("seo_title")),
        seo_description: cellAt(row, columnIndex("seo_description")),
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
      },
    });
  });

  const filled = forwardFillIdentity(records);
  for (const record of filled) {
    if (!hasIdentity(record)) {
      issues.push({ rowNumber: record.rowNumber, code: "missing_identity" });
    }
    issues.push(...validateImportRecord(record, operations));
  }

  return { mapping, operations, records: filled, issues, truncated };
}

export function validateImportRecord(
  record: ProductImportRecord,
  operations: ProductImportOperation[],
): ProductImportIssue[] {
  const issues: ProductImportIssue[] = [];
  const { cells, rowNumber } = record;
  if (operations.includes("price") && cells.price) {
    const cents = Number(cells.price.replace(/,/g, ""));
    if (!Number.isFinite(cents) || cents < 0) {
      issues.push({ rowNumber, code: "invalid_price", column: "price", value: cells.price });
    }
  }
  if (operations.includes("price") && cells.compare_at) {
    const cents = Number(cells.compare_at.replace(/,/g, ""));
    if (!Number.isFinite(cents) || cents < 0) {
      issues.push({
        rowNumber,
        code: "invalid_price",
        column: "compare_at",
        value: cells.compare_at,
      });
    }
  }
  if (operations.includes("seoTitle") && cells.seo_title) {
    if (seoDisplayWidth(cells.seo_title) > SEO_TITLE_MAX_WIDTH) {
      issues.push({
        rowNumber,
        code: "too_long_seo_title",
        column: "seo_title",
        value: cells.seo_title,
      });
    }
  }
  if (operations.includes("seoDescription") && cells.seo_description) {
    if (seoDisplayWidth(cells.seo_description) > SEO_DESCRIPTION_MAX_WIDTH) {
      issues.push({
        rowNumber,
        code: "too_long_seo_description",
        column: "seo_description",
        value: cells.seo_description,
      });
    }
  }
  if (operations.includes("status") && cells.status && parseImportStatus(cells.status) == null) {
    issues.push({ rowNumber, code: "invalid_status", column: "status", value: cells.status });
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
  return issues;
}

export function rowHasBlockingIssue(
  issues: ProductImportIssue[],
  rowNumber: number,
): boolean {
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
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(PRODUCT_IMPORT_OPERATIONS);
  return raw.filter((item): item is ProductImportOperation => typeof item === "string" && allowed.has(item));
}
