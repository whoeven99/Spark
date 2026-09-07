/**
 * 批量改商品标量字段 — vendor / productType / SEO 标题 / SEO 描述。
 * 纯函数：规则 → changeset，不含 Shopify IO。
 */
import { toCsv } from "./csv";
import { SEO_DESCRIPTION_MAX_WIDTH, SEO_TITLE_MAX_WIDTH, seoDisplayWidth } from "./seoAudit";

export const BULK_PRODUCT_FIELD_EDIT_MAX_PRODUCTS = 200;

export const BULK_PRODUCT_FIELD_EDIT_FIELDS = [
  "vendor",
  "productType",
  "seoTitle",
  "seoDescription",
] as const;

export type BulkProductFieldEditField = (typeof BULK_PRODUCT_FIELD_EDIT_FIELDS)[number];
export type BulkProductFieldEditMode = "set" | "clear";

export type BulkProductFieldEditRule = {
  field: BulkProductFieldEditField;
  mode: BulkProductFieldEditMode;
  value: string;
};

export type BulkProductFieldEditSkipReason = "no_change" | "empty_value" | "too_long";

export type BulkProductFieldEditProductInput = {
  productId: string;
  productTitle: string;
  vendor: string;
  productType: string;
  seoTitle: string;
  seoDescription: string;
};

export type BulkProductFieldEditRow = {
  productId: string;
  productTitle: string;
  field: BulkProductFieldEditField;
  beforeValue: string;
  afterValue: string;
  skipped: boolean;
  skipReason?: BulkProductFieldEditSkipReason;
};

export type BulkProductFieldEditSummary = {
  products: number;
  changed: number;
  skipped: number;
};

export type BulkProductFieldEditApplyOutcome = {
  at: string;
  succeeded: number;
  failed: number;
  errors: Array<{ productId: string; message: string }>;
};

export class BulkProductFieldEditRuleError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BulkProductFieldEditRuleError";
    this.code = code;
  }
}

function isField(value: string): value is BulkProductFieldEditField {
  return (BULK_PRODUCT_FIELD_EDIT_FIELDS as readonly string[]).includes(value);
}

export function parseBulkProductFieldEditRule(
  params: Record<string, string>,
): BulkProductFieldEditRule {
  const field = (params.field ?? "").trim();
  if (!isField(field)) {
    throw new BulkProductFieldEditRuleError(
      "invalid_field",
      "请先选择要改的字段：Vendor、商品类型、SEO 标题或 SEO 描述",
    );
  }
  const modeRaw = (params.mode ?? "set").trim().toLowerCase();
  if (modeRaw !== "clear" && modeRaw !== "set") {
    throw new BulkProductFieldEditRuleError("invalid_mode", "操作方式只能是「设为指定值」或「清空」");
  }
  const mode: BulkProductFieldEditMode = modeRaw === "clear" ? "clear" : "set";
  const value = (params.value ?? "").trim();
  if (mode === "set" && !value) {
    throw new BulkProductFieldEditRuleError("empty_value", "设为指定值时请填写要写入的内容");
  }
  return { field, mode, value: mode === "clear" ? "" : value };
}

function currentValue(
  product: BulkProductFieldEditProductInput,
  field: BulkProductFieldEditField,
): string {
  return product[field] ?? "";
}

function seoMaxWidth(field: BulkProductFieldEditField): number | null {
  if (field === "seoTitle") return SEO_TITLE_MAX_WIDTH;
  if (field === "seoDescription") return SEO_DESCRIPTION_MAX_WIDTH;
  return null;
}

export function computeProductFieldChange(
  product: BulkProductFieldEditProductInput,
  rule: BulkProductFieldEditRule,
): BulkProductFieldEditRow {
  const beforeValue = currentValue(product, rule.field);
  const afterValue = rule.mode === "clear" ? "" : rule.value;
  const base: BulkProductFieldEditRow = {
    productId: product.productId,
    productTitle: product.productTitle,
    field: rule.field,
    beforeValue,
    afterValue,
    skipped: false,
  };
  if (beforeValue === afterValue) {
    return { ...base, skipped: true, skipReason: "no_change" };
  }
  const maxWidth = seoMaxWidth(rule.field);
  if (maxWidth != null && afterValue && seoDisplayWidth(afterValue) > maxWidth) {
    return { ...base, afterValue: beforeValue, skipped: true, skipReason: "too_long" };
  }
  return base;
}

export function buildBulkProductFieldEditSummary(
  rows: BulkProductFieldEditRow[],
): BulkProductFieldEditSummary {
  let changed = 0;
  let skipped = 0;
  for (const row of rows) {
    if (row.skipped) skipped += 1;
    else changed += 1;
  }
  return { products: rows.length, changed, skipped };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isSkipReason(value: string): value is BulkProductFieldEditSkipReason {
  return value === "no_change" || value === "empty_value" || value === "too_long";
}

export function coerceBulkProductFieldEditRows(raw: unknown): BulkProductFieldEditRow[] {
  if (!Array.isArray(raw)) return [];
  const out: BulkProductFieldEditRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const productId = asString(record.productId).trim();
    const field = asString(record.field).trim();
    if (!productId || !isField(field)) continue;
    const skipped = record.skipped === true;
    const beforeValue = asString(record.beforeValue);
    const afterValue = asString(record.afterValue);
    if (!skipped && beforeValue === afterValue) continue;
    const skipReason = asString(record.skipReason).trim();
    out.push({
      productId,
      productTitle: asString(record.productTitle),
      field,
      beforeValue,
      afterValue,
      skipped,
      ...(isSkipReason(skipReason) ? { skipReason } : {}),
    });
  }
  return out;
}

const CHANGESET_HEADERS = [
  "product_title",
  "product_id",
  "field",
  "before",
  "after",
  "action",
  "reason",
] as const;

export function buildBulkProductFieldEditChangesetCsv(rows: BulkProductFieldEditRow[]): string {
  return toCsv(
    CHANGESET_HEADERS,
    rows.map((row) => [
      row.productTitle,
      row.productId,
      row.field,
      row.beforeValue,
      row.skipped ? "" : row.afterValue,
      row.skipped ? "skip" : "change",
      row.skipped ? (row.skipReason ?? "") : "",
    ]),
  );
}

export function buildBulkProductFieldEditRollbackCsv(rows: BulkProductFieldEditRow[]): string {
  return toCsv(
    ["product_id", "product_title", "field", "rollback_value"] as const,
    rows
      .filter((row) => !row.skipped)
      .map((row) => [row.productId, row.productTitle, row.field, row.beforeValue]),
  );
}
