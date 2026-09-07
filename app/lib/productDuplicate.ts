/**
 * 复制商品 — 算出新标题与目标状态。纯函数，不含 Shopify IO。
 */
import { toCsv } from "./csv";

export const PRODUCT_DUPLICATE_MAX_PRODUCTS = 50;
export const PRODUCT_DUPLICATE_DEFAULT_SUFFIX = " (Copy)";

export type ProductDuplicateRule = {
  titleSuffix: string;
  includeImages: boolean;
  newStatus: "ACTIVE" | "DRAFT";
};

export type ProductDuplicateProductInput = {
  productId: string;
  productTitle: string;
  status: string;
};

export type ProductDuplicateRow = {
  productId: string;
  productTitle: string;
  newTitle: string;
  sourceStatus: string;
  newStatus: "ACTIVE" | "DRAFT";
  includeImages: boolean;
  skipped: boolean;
  skipReason?: "empty_title";
};

export type ProductDuplicateSummary = {
  products: number;
  changed: number;
  skipped: number;
};

export type ProductDuplicateApplyOutcome = {
  at: string;
  succeeded: number;
  failed: number;
  errors: Array<{ productId: string; message: string }>;
};

export function parseProductDuplicateRule(params: Record<string, string>): ProductDuplicateRule {
  const rawSuffix = params.titleSuffix ?? "";
  // 默认后缀带前导空格（" (Copy)"）；全空白才回落到默认，避免 trim 把空格吃掉
  const titleSuffix = rawSuffix.trim() === "" ? PRODUCT_DUPLICATE_DEFAULT_SUFFIX : rawSuffix;
  const includeRaw = (params.includeImages ?? "true").trim().toLowerCase();
  const includeImages = includeRaw !== "false" && includeRaw !== "no" && includeRaw !== "0";
  const statusRaw = (params.newStatus ?? "draft").trim().toUpperCase();
  const newStatus: "ACTIVE" | "DRAFT" = statusRaw === "ACTIVE" ? "ACTIVE" : "DRAFT";
  return { titleSuffix, includeImages, newStatus };
}

export function computeProductDuplicate(
  product: ProductDuplicateProductInput,
  rule: ProductDuplicateRule,
): ProductDuplicateRow {
  const sourceTitle = product.productTitle.trim();
  const newTitle = `${sourceTitle}${rule.titleSuffix}`.trim();
  if (!sourceTitle || !newTitle) {
    return {
      productId: product.productId,
      productTitle: product.productTitle,
      newTitle: sourceTitle,
      sourceStatus: product.status,
      newStatus: rule.newStatus,
      includeImages: rule.includeImages,
      skipped: true,
      skipReason: "empty_title",
    };
  }
  return {
    productId: product.productId,
    productTitle: product.productTitle,
    newTitle,
    sourceStatus: product.status,
    newStatus: rule.newStatus,
    includeImages: rule.includeImages,
    skipped: false,
  };
}

export function buildProductDuplicateSummary(rows: ProductDuplicateRow[]): ProductDuplicateSummary {
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

export function coerceProductDuplicateRows(raw: unknown): ProductDuplicateRow[] {
  if (!Array.isArray(raw)) return [];
  const out: ProductDuplicateRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const productId = asString(record.productId).trim();
    const newTitle = asString(record.newTitle).trim();
    if (!productId) continue;
    const skipped = record.skipped === true;
    if (!skipped && !newTitle) continue;
    const statusRaw = asString(record.newStatus).toUpperCase();
    out.push({
      productId,
      productTitle: asString(record.productTitle),
      newTitle,
      sourceStatus: asString(record.sourceStatus),
      newStatus: statusRaw === "ACTIVE" ? "ACTIVE" : "DRAFT",
      includeImages: record.includeImages !== false,
      skipped,
      ...(asString(record.skipReason) === "empty_title" ? { skipReason: "empty_title" } : {}),
    });
  }
  return out;
}

export function buildProductDuplicateChangesetCsv(rows: ProductDuplicateRow[]): string {
  return toCsv(
    [
      "product_title",
      "product_id",
      "new_title",
      "new_status",
      "include_images",
      "action",
      "reason",
    ] as const,
    rows.map((row) => [
      row.productTitle,
      row.productId,
      row.skipped ? "" : row.newTitle,
      row.newStatus,
      row.includeImages ? "yes" : "no",
      row.skipped ? "skip" : "duplicate",
      row.skipped ? (row.skipReason ?? "") : "",
    ]),
  );
}
