/**
 * 价目表导入 — 列映射、价格规范化、匹配分类与 CSV（纯函数，浏览器与服务端共用）。
 *
 * 和 `bulkPriceEdit.ts` 的分工：那边是「按规则算出新价」，这边是「新价直接来自商户上传的表格」。
 * 两者产出同一种 `BulkPriceEditRow`，因此共用同一个写回执行器
 * （`bulkPriceEditApply.server.ts` 仍是全仓库唯一 `productVariantsBulkUpdate` 调用处）。
 *
 * 本文件不接触 Shopify、不做任何写入；匹配所需的变体数据由调用方读好后传进来。
 */
import { toCsv } from "./csv";
import {
  formatCentsToMoney,
  parseMoneyToCents,
  type BulkPriceEditRow,
} from "./bulkPriceEdit";
import {
  isSuspiciousMagnitude,
  normalizeSku,
  parseImportMoneyToCents,
  SHEET_IMPORT_MAX_ROWS,
  SHEET_IMPORT_MIN_MATCH_RATE,
  SHEET_IMPORT_SUSPICIOUS_RATIO,
  SheetImportMappingError,
  skuKey,
  validateColumnsAgainstHeaders,
  type SheetRow,
} from "./sheetImport";

// 表格读取与金额解析是所有「按表格导入」共用的，见 `sheetImport.ts`。
// 这里保留旧名字对外导出，调用方与测试无需改动。
export { normalizeSku, parseImportMoneyToCents };
export { SheetImportMappingError as BulkPriceImportMappingError };

/** 单次导入的行数硬上限，与批量调价的变体上限对齐。 */
export const BULK_PRICE_IMPORT_MAX_ROWS = SHEET_IMPORT_MAX_ROWS;
export const BULK_PRICE_IMPORT_MIN_MATCH_RATE = SHEET_IMPORT_MIN_MATCH_RATE;
export const BULK_PRICE_IMPORT_SUSPICIOUS_RATIO = SHEET_IMPORT_SUSPICIOUS_RATIO;

export type BulkPriceImportSheetRow = SheetRow;

export type BulkPriceImportMapping = {
  skuColumn: string;
  priceColumn: string;
  /** null 表示不改划线价 */
  compareAtColumn: string | null;
};

/** 行级问题码（i18n key 后缀）。 */
export type BulkPriceImportIssueReason =
  | "missing_sku"
  | "missing_price"
  | "invalid_price"
  | "invalid_compare_at"
  | "duplicate_sku_in_file"
  | "sku_not_found"
  | "sku_matches_multiple";

export type BulkPriceImportIssue = {
  sourceRow: number;
  sku: string;
  reason: BulkPriceImportIssueReason;
  /** 原始单元格文本，方便用户回表格里定位 */
  raw?: string;
};

export type BulkPriceImportNote = "suspicious_magnitude";

/** 与 `BulkPriceEditRow` 结构兼容，可直接交给写回执行器。 */
export type BulkPriceImportRow = BulkPriceEditRow & {
  sourceRow: number;
  importNote?: BulkPriceImportNote;
};

export type BulkPriceImportSummary = {
  /** 表格里的有效数据行数 */
  sheetRows: number;
  matched: number;
  changed: number;
  unchanged: number;
  /** 未匹配 + 数据非法的行数 */
  issues: number;
};

export type BulkPriceImportEntry = {
  sourceRow: number;
  sku: string;
  priceCents: number;
  compareAtCents: number | null;
};

// ─── 映射解析 ─────────────────────────────────────────────────────────────────

export function parseBulkPriceImportMapping(
  params: Record<string, string>,
): BulkPriceImportMapping {
  const skuColumn = (params.skuColumn ?? "").trim();
  const priceColumn = (params.priceColumn ?? "").trim();
  const compareAtColumn = (params.compareAtColumn ?? "").trim();

  if (!skuColumn) {
    throw new SheetImportMappingError("missing_sku_column", "请填写表格里的 SKU 列名");
  }
  if (!priceColumn) {
    throw new SheetImportMappingError("missing_price_column", "请填写表格里的价格列名");
  }
  if (priceColumn === compareAtColumn) {
    throw new SheetImportMappingError("duplicate_column", "价格列与划线价列不能是同一列");
  }

  return {
    skuColumn,
    priceColumn,
    compareAtColumn: compareAtColumn || null,
  };
}

/** 映射到的列必须真实存在，否则整表读出来会全是空值。 */
export function validateMappingAgainstHeaders(
  mapping: BulkPriceImportMapping,
  headers: string[],
): void {
  validateColumnsAgainstHeaders(
    [
      mapping.skuColumn,
      mapping.priceColumn,
      ...(mapping.compareAtColumn ? [mapping.compareAtColumn] : []),
    ],
    headers,
  );
}

// ─── 行解析 ───────────────────────────────────────────────────────────────────

/**
 * 表格行 → 导入条目。
 * 同一个 SKU 在文件里出现多次时全部作废（价格不一致时无从判断以哪行为准）。
 */
export function buildBulkPriceImportEntries(
  rows: BulkPriceImportSheetRow[],
  mapping: BulkPriceImportMapping,
): { entries: BulkPriceImportEntry[]; issues: BulkPriceImportIssue[] } {
  const issues: BulkPriceImportIssue[] = [];
  const staged: BulkPriceImportEntry[] = [];

  for (const row of rows) {
    const sku = normalizeSku(row.cells[mapping.skuColumn] ?? "");
    if (!sku) {
      issues.push({ sourceRow: row.sourceRow, sku: "", reason: "missing_sku" });
      continue;
    }

    const rawPrice = row.cells[mapping.priceColumn] ?? "";
    if (!rawPrice.trim()) {
      issues.push({ sourceRow: row.sourceRow, sku, reason: "missing_price" });
      continue;
    }
    const priceCents = parseImportMoneyToCents(rawPrice);
    if (priceCents == null) {
      issues.push({ sourceRow: row.sourceRow, sku, reason: "invalid_price", raw: rawPrice });
      continue;
    }

    let compareAtCents: number | null = null;
    if (mapping.compareAtColumn) {
      const rawCompareAt = row.cells[mapping.compareAtColumn] ?? "";
      if (rawCompareAt.trim()) {
        compareAtCents = parseImportMoneyToCents(rawCompareAt);
        if (compareAtCents == null) {
          issues.push({
            sourceRow: row.sourceRow,
            sku,
            reason: "invalid_compare_at",
            raw: rawCompareAt,
          });
          continue;
        }
      }
    }

    staged.push({ sourceRow: row.sourceRow, sku, priceCents, compareAtCents });
  }

  const countBySku = new Map<string, number>();
  for (const entry of staged) {
    const key = skuKey(entry.sku);
    countBySku.set(key, (countBySku.get(key) ?? 0) + 1);
  }

  const entries: BulkPriceImportEntry[] = [];
  for (const entry of staged) {
    if ((countBySku.get(skuKey(entry.sku)) ?? 0) > 1) {
      issues.push({
        sourceRow: entry.sourceRow,
        sku: entry.sku,
        reason: "duplicate_sku_in_file",
      });
      continue;
    }
    entries.push(entry);
  }

  return { entries, issues };
}

// ─── 匹配与变更计算 ───────────────────────────────────────────────────────────

export type BulkPriceImportVariant = {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  price: string | null;
  compareAtPrice: string | null;
};

/**
 * 把导入条目和店铺变体对起来。
 * SKU 在 Shopify 里不保证唯一，命中多个变体时不猜、整行跳过并报冲突。
 */
export function computeBulkPriceImportRows(
  entries: BulkPriceImportEntry[],
  variants: BulkPriceImportVariant[],
): { rows: BulkPriceImportRow[]; issues: BulkPriceImportIssue[] } {
  const bySku = new Map<string, BulkPriceImportVariant[]>();
  for (const variant of variants) {
    if (!variant.sku) continue;
    const key = skuKey(variant.sku);
    const list = bySku.get(key);
    if (list) list.push(variant);
    else bySku.set(key, [variant]);
  }

  const rows: BulkPriceImportRow[] = [];
  const issues: BulkPriceImportIssue[] = [];

  for (const entry of entries) {
    const matches = bySku.get(skuKey(entry.sku)) ?? [];
    if (matches.length === 0) {
      issues.push({ sourceRow: entry.sourceRow, sku: entry.sku, reason: "sku_not_found" });
      continue;
    }
    if (matches.length > 1) {
      issues.push({
        sourceRow: entry.sourceRow,
        sku: entry.sku,
        reason: "sku_matches_multiple",
      });
      continue;
    }

    const variant = matches[0];
    const beforeCents = parseMoneyToCents(variant.price);
    const beforeCompareAtCents = parseMoneyToCents(variant.compareAtPrice);
    const beforePrice = beforeCents != null ? formatCentsToMoney(beforeCents) : "";
    const beforeCompareAt =
      beforeCompareAtCents != null ? formatCentsToMoney(beforeCompareAtCents) : null;

    const priceChanged = beforeCents !== entry.priceCents;
    // 没映射划线价列，或该行留空 → 不动划线价
    const compareAtChanged =
      entry.compareAtCents != null && entry.compareAtCents !== beforeCompareAtCents;

    const base: BulkPriceImportRow = {
      sourceRow: entry.sourceRow,
      variantId: variant.variantId,
      productId: variant.productId,
      productTitle: variant.productTitle,
      variantTitle: variant.variantTitle,
      sku: variant.sku,
      beforePrice,
      afterPrice: formatCentsToMoney(entry.priceCents),
      beforeCompareAt,
      afterCompareAt: compareAtChanged
        ? formatCentsToMoney(entry.compareAtCents as number)
        : beforeCompareAt,
      priceChanged,
      compareAtChanged,
      skipped: false,
    };

    if (!priceChanged && !compareAtChanged) {
      rows.push({ ...base, afterPrice: beforePrice, skipped: true, skipReason: "no_change" });
      continue;
    }

    const suspicious =
      beforeCents != null && isSuspiciousMagnitude(beforeCents, entry.priceCents);
    rows.push({ ...base, ...(suspicious ? { importNote: "suspicious_magnitude" } : {}) });
  }

  return { rows, issues };
}

export function buildBulkPriceImportSummary(
  sheetRows: number,
  rows: BulkPriceImportRow[],
  issues: BulkPriceImportIssue[],
): BulkPriceImportSummary {
  let changed = 0;
  let unchanged = 0;
  for (const row of rows) {
    if (row.skipped) unchanged += 1;
    else changed += 1;
  }
  return {
    sheetRows,
    matched: rows.length,
    changed,
    unchanged,
    issues: issues.length,
  };
}

/** 匹配率：撞上店铺变体的行 ÷ 表格有效行。用于判断列映射是不是选错了。 */
export function computeMatchRate(summary: BulkPriceImportSummary): number {
  if (summary.sheetRows === 0) return 0;
  return summary.matched / summary.sheetRows;
}

// ─── 反序列化 ─────────────────────────────────────────────────────────────────

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * 从任务 result 读回问题行清单。写回不消费它，只用于 UI 与 CSV。
 */
export function coerceBulkPriceImportIssues(raw: unknown): BulkPriceImportIssue[] {
  if (!Array.isArray(raw)) return [];
  const out: BulkPriceImportIssue[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const reason = asString(r.reason).trim();
    if (!reason) continue;
    out.push({
      sourceRow: typeof r.sourceRow === "number" ? r.sourceRow : 0,
      sku: asString(r.sku),
      reason: reason as BulkPriceImportIssueReason,
      ...(asString(r.raw) ? { raw: asString(r.raw) } : {}),
    });
  }
  return out;
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

const CHANGESET_CSV_HEADERS = [
  "source_row",
  "sku",
  "product_title",
  "variant_title",
  "variant_id",
  "before_price",
  "after_price",
  "before_compare_at_price",
  "after_compare_at_price",
  "action",
  "reason",
  "notes",
] as const;

export function buildBulkPriceImportChangesetCsv(rows: BulkPriceImportRow[]): string {
  return toCsv(
    CHANGESET_CSV_HEADERS,
    rows.map((row) => [
      String(row.sourceRow),
      row.sku ?? "",
      row.productTitle,
      row.variantTitle,
      row.variantId,
      row.beforePrice,
      row.skipped ? "" : row.afterPrice,
      row.beforeCompareAt ?? "",
      row.skipped || !row.compareAtChanged ? "" : (row.afterCompareAt ?? ""),
      row.skipped ? "skip" : "change",
      row.skipped ? (row.skipReason ?? "") : "",
      row.importNote ?? "",
    ]),
  );
}

const ISSUES_CSV_HEADERS = ["source_row", "sku", "reason", "raw_value"] as const;

/** 未写入的行：表格里有但没落到店铺上的部分，是这个功能最需要交代清楚的东西。 */
export function buildBulkPriceImportIssuesCsv(issues: BulkPriceImportIssue[]): string {
  return toCsv(
    ISSUES_CSV_HEADERS,
    issues.map((issue) => [
      String(issue.sourceRow),
      issue.sku,
      issue.reason,
      issue.raw ?? "",
    ]),
  );
}

const ROLLBACK_CSV_HEADERS = [
  "variant_id",
  "sku",
  "product_title",
  "variant_title",
  "price",
  "compare_at_price",
] as const;

export function buildBulkPriceImportRollbackCsv(rows: BulkPriceImportRow[]): string {
  return toCsv(
    ROLLBACK_CSV_HEADERS,
    rows
      .filter((row) => !row.skipped)
      .map((row) => [
        row.variantId,
        row.sku ?? "",
        row.productTitle,
        row.variantTitle,
        row.beforePrice,
        row.beforeCompareAt ?? "",
      ]),
  );
}
