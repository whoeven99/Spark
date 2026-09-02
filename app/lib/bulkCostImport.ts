/**
 * 成本价导入 — 列映射、匹配分类、毛利率试算与 CSV（纯函数，浏览器与服务端共用）。
 *
 * 和 `bulkPriceImport.ts` 的分工：那边改的是买家看到的售价（写 variant），
 * 这边改的是只影响利润报表的单位成本（写 InventoryItem.unitCost）。
 * 两者风险等级不同，因此是两个独立任务类型、两个独立写回执行器。
 *
 * 本文件不接触 Shopify、不做任何写入；匹配所需的变体数据由调用方读好后传进来。
 */
import { toCsv } from "./csv";
import { formatCentsToMoney, parseMoneyToCents } from "./bulkPriceEdit";
import {
  isSuspiciousMagnitude,
  normalizeSku,
  parseImportMoneyToCents,
  SHEET_IMPORT_MAX_ROWS,
  SHEET_IMPORT_MIN_MATCH_RATE,
  SheetImportMappingError,
  skuKey,
  validateColumnsAgainstHeaders,
  type SheetRow,
} from "./sheetImport";

export const BULK_COST_IMPORT_MAX_ROWS = SHEET_IMPORT_MAX_ROWS;
export const BULK_COST_IMPORT_MIN_MATCH_RATE = SHEET_IMPORT_MIN_MATCH_RATE;

export type BulkCostImportMapping = {
  skuColumn: string;
  costColumn: string;
};

/** 行级问题码（i18n key 后缀）。这些行不会写回。 */
export type BulkCostImportIssueReason =
  | "missing_sku"
  | "missing_cost"
  | "invalid_cost"
  | "duplicate_sku_in_file"
  | "sku_not_found"
  | "sku_matches_multiple"
  | "no_inventory_item";

export type BulkCostImportIssue = {
  sourceRow: number;
  sku: string;
  reason: BulkCostImportIssueReason;
  /** 原始单元格文本，方便用户回表格里定位 */
  raw?: string;
};

/**
 * 行级备注。和 issue 的区别：备注只警告，不阻止写回。
 * - `suspicious_magnitude`：新旧成本差了两个数量级，多半是解析歧义或手滑多打零
 * - `negative_margin`：成本高于售价，写回后毛利为负（赔本清仓是真实场景，所以不阻断）
 */
export type BulkCostImportNote = "suspicious_magnitude" | "negative_margin";

export type BulkCostImportRow = {
  sourceRow: number;
  /** InventoryItem 的 gid，写回时用它，不是 variantId */
  inventoryItemId: string;
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  /** 空串表示这个变体原本没有设过成本 */
  beforeCost: string;
  afterCost: string;
  /** 变体售价，用于算毛利率；null 表示读不到 */
  price: string | null;
  beforeMarginPercent: number | null;
  afterMarginPercent: number | null;
  skipped: boolean;
  skipReason?: "no_change";
  notes?: BulkCostImportNote[];
};

export type BulkCostImportSummary = {
  /** 表格里的有效数据行数 */
  sheetRows: number;
  matched: number;
  changed: number;
  unchanged: number;
  /** 未匹配 + 数据非法的行数 */
  issues: number;
  /** 写回后毛利为负的行数 */
  negativeMargin: number;
};

export type BulkCostImportEntry = {
  sourceRow: number;
  sku: string;
  costCents: number;
};

export type BulkCostImportVariant = {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  price: string | null;
  inventoryItemId: string | null;
  unitCost: string | null;
};

export type BulkCostImportApplyOutcome = {
  at: string;
  succeeded: number;
  failed: number;
  errors: Array<{ inventoryItemId: string; message: string }>;
};

// ─── 映射解析 ─────────────────────────────────────────────────────────────────

export function parseBulkCostImportMapping(
  params: Record<string, string>,
): BulkCostImportMapping {
  const skuColumn = (params.skuColumn ?? "").trim();
  const costColumn = (params.costColumn ?? "").trim();

  if (!skuColumn) {
    throw new SheetImportMappingError("missing_sku_column", "请填写表格里的 SKU 列名");
  }
  if (!costColumn) {
    throw new SheetImportMappingError("missing_cost_column", "请填写表格里的成本价列名");
  }
  if (skuColumn === costColumn) {
    throw new SheetImportMappingError("duplicate_column", "SKU 列与成本价列不能是同一列");
  }

  return { skuColumn, costColumn };
}

export function validateCostMappingAgainstHeaders(
  mapping: BulkCostImportMapping,
  headers: string[],
): void {
  validateColumnsAgainstHeaders([mapping.skuColumn, mapping.costColumn], headers);
}

// ─── 行解析 ───────────────────────────────────────────────────────────────────

/**
 * 表格行 → 导入条目。
 * 同一个 SKU 在文件里出现多次时全部作废（成本不一致时无从判断以哪行为准）。
 */
export function buildBulkCostImportEntries(
  rows: SheetRow[],
  mapping: BulkCostImportMapping,
): { entries: BulkCostImportEntry[]; issues: BulkCostImportIssue[] } {
  const issues: BulkCostImportIssue[] = [];
  const staged: BulkCostImportEntry[] = [];

  for (const row of rows) {
    const sku = normalizeSku(row.cells[mapping.skuColumn] ?? "");
    if (!sku) {
      issues.push({ sourceRow: row.sourceRow, sku: "", reason: "missing_sku" });
      continue;
    }

    const rawCost = row.cells[mapping.costColumn] ?? "";
    if (!rawCost.trim()) {
      issues.push({ sourceRow: row.sourceRow, sku, reason: "missing_cost" });
      continue;
    }
    const costCents = parseImportMoneyToCents(rawCost);
    if (costCents == null) {
      issues.push({ sourceRow: row.sourceRow, sku, reason: "invalid_cost", raw: rawCost });
      continue;
    }

    staged.push({ sourceRow: row.sourceRow, sku, costCents });
  }

  const countBySku = new Map<string, number>();
  for (const entry of staged) {
    const key = skuKey(entry.sku);
    countBySku.set(key, (countBySku.get(key) ?? 0) + 1);
  }

  const entries: BulkCostImportEntry[] = [];
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

// ─── 毛利率 ───────────────────────────────────────────────────────────────────

/**
 * 毛利率 =（售价 − 成本）÷ 售价，保留一位小数。
 * 售价缺失或为 0 时返回 null（除零没有意义，UI 显示为「—」）。
 */
export function computeMarginPercent(
  priceCents: number | null,
  costCents: number | null,
): number | null {
  if (priceCents == null || costCents == null || priceCents <= 0) return null;
  return Math.round(((priceCents - costCents) / priceCents) * 1000) / 10;
}

// ─── 匹配与变更计算 ───────────────────────────────────────────────────────────

/**
 * 把导入条目和店铺变体对起来。
 * SKU 在 Shopify 里不保证唯一，命中多个变体时不猜、整行跳过并报冲突。
 */
export function computeBulkCostImportRows(
  entries: BulkCostImportEntry[],
  variants: BulkCostImportVariant[],
): { rows: BulkCostImportRow[]; issues: BulkCostImportIssue[] } {
  const bySku = new Map<string, BulkCostImportVariant[]>();
  for (const variant of variants) {
    if (!variant.sku) continue;
    const key = skuKey(variant.sku);
    const list = bySku.get(key);
    if (list) list.push(variant);
    else bySku.set(key, [variant]);
  }

  const rows: BulkCostImportRow[] = [];
  const issues: BulkCostImportIssue[] = [];

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
    // 成本挂在 InventoryItem 上，没有它就没法写回
    if (!variant.inventoryItemId) {
      issues.push({
        sourceRow: entry.sourceRow,
        sku: entry.sku,
        reason: "no_inventory_item",
      });
      continue;
    }

    const beforeCents = parseMoneyToCents(variant.unitCost);
    const priceCents = parseMoneyToCents(variant.price);
    const beforeCost = beforeCents != null ? formatCentsToMoney(beforeCents) : "";
    const afterCost = formatCentsToMoney(entry.costCents);

    const base: BulkCostImportRow = {
      sourceRow: entry.sourceRow,
      inventoryItemId: variant.inventoryItemId,
      variantId: variant.variantId,
      productId: variant.productId,
      productTitle: variant.productTitle,
      variantTitle: variant.variantTitle,
      sku: variant.sku,
      beforeCost,
      afterCost,
      price: priceCents != null ? formatCentsToMoney(priceCents) : null,
      beforeMarginPercent: computeMarginPercent(priceCents, beforeCents),
      afterMarginPercent: computeMarginPercent(priceCents, entry.costCents),
      skipped: false,
    };

    if (beforeCents === entry.costCents) {
      rows.push({ ...base, afterCost: beforeCost, skipped: true, skipReason: "no_change" });
      continue;
    }

    const notes: BulkCostImportNote[] = [];
    if (beforeCents != null && isSuspiciousMagnitude(beforeCents, entry.costCents)) {
      notes.push("suspicious_magnitude");
    }
    if (priceCents != null && priceCents > 0 && entry.costCents > priceCents) {
      notes.push("negative_margin");
    }

    rows.push({ ...base, ...(notes.length > 0 ? { notes } : {}) });
  }

  return { rows, issues };
}

export function buildBulkCostImportSummary(
  sheetRows: number,
  rows: BulkCostImportRow[],
  issues: BulkCostImportIssue[],
): BulkCostImportSummary {
  let changed = 0;
  let unchanged = 0;
  let negativeMargin = 0;
  for (const row of rows) {
    if (row.skipped) unchanged += 1;
    else changed += 1;
    if (row.notes?.includes("negative_margin")) negativeMargin += 1;
  }
  return {
    sheetRows,
    matched: rows.length,
    changed,
    unchanged,
    issues: issues.length,
    negativeMargin,
  };
}

/** 匹配率：撞上店铺变体的行 ÷ 表格有效行。用于判断列映射是不是选错了。 */
export function computeCostMatchRate(summary: BulkCostImportSummary): number {
  if (summary.sheetRows === 0) return 0;
  return summary.matched / summary.sheetRows;
}

// ─── 反序列化 ─────────────────────────────────────────────────────────────────

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asNullableNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

const NOTE_VALUES = new Set<string>(["suspicious_magnitude", "negative_margin"]);

/**
 * 从任务 result 读回可写回的行。写回执行器只信这里产出的结构，
 * 缺 inventoryItemId 或已跳过的行一律丢弃。
 */
export function coerceBulkCostImportRows(raw: unknown): BulkCostImportRow[] {
  if (!Array.isArray(raw)) return [];
  const out: BulkCostImportRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const inventoryItemId = asString(r.inventoryItemId).trim();
    if (!inventoryItemId) continue;
    const afterCost = asString(r.afterCost).trim();
    if (!afterCost) continue;

    const notes = Array.isArray(r.notes)
      ? r.notes.filter((n): n is BulkCostImportNote => NOTE_VALUES.has(asString(n)))
      : [];

    out.push({
      sourceRow: typeof r.sourceRow === "number" ? r.sourceRow : 0,
      inventoryItemId,
      variantId: asString(r.variantId),
      productId: asString(r.productId),
      productTitle: asString(r.productTitle),
      variantTitle: asString(r.variantTitle),
      sku: asString(r.sku) || null,
      beforeCost: asString(r.beforeCost),
      afterCost,
      price: asString(r.price) || null,
      beforeMarginPercent: asNullableNumber(r.beforeMarginPercent),
      afterMarginPercent: asNullableNumber(r.afterMarginPercent),
      skipped: r.skipped === true,
      ...(asString(r.skipReason) ? { skipReason: "no_change" as const } : {}),
      ...(notes.length > 0 ? { notes } : {}),
    });
  }
  return out;
}

export function coerceBulkCostImportIssues(raw: unknown): BulkCostImportIssue[] {
  if (!Array.isArray(raw)) return [];
  const out: BulkCostImportIssue[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const reason = asString(r.reason).trim();
    if (!reason) continue;
    out.push({
      sourceRow: typeof r.sourceRow === "number" ? r.sourceRow : 0,
      sku: asString(r.sku),
      reason: reason as BulkCostImportIssueReason,
      ...(asString(r.raw) ? { raw: asString(r.raw) } : {}),
    });
  }
  return out;
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

function formatMargin(value: number | null): string {
  return value == null ? "" : `${value}`;
}

const CHANGESET_CSV_HEADERS = [
  "source_row",
  "sku",
  "product_title",
  "variant_title",
  "inventory_item_id",
  "before_cost",
  "after_cost",
  "price",
  "before_margin_percent",
  "after_margin_percent",
  "action",
  "reason",
  "notes",
] as const;

export function buildBulkCostImportChangesetCsv(rows: BulkCostImportRow[]): string {
  return toCsv(
    CHANGESET_CSV_HEADERS,
    rows.map((row) => [
      String(row.sourceRow),
      row.sku ?? "",
      row.productTitle,
      row.variantTitle,
      row.inventoryItemId,
      row.beforeCost,
      row.skipped ? "" : row.afterCost,
      row.price ?? "",
      formatMargin(row.beforeMarginPercent),
      row.skipped ? "" : formatMargin(row.afterMarginPercent),
      row.skipped ? "skip" : "change",
      row.skipped ? (row.skipReason ?? "") : "",
      (row.notes ?? []).join("|"),
    ]),
  );
}

const ISSUES_CSV_HEADERS = ["source_row", "sku", "reason", "raw_value"] as const;

/** 未写入的行：表格里有但没落到店铺上的部分，是这个功能最需要交代清楚的东西。 */
export function buildBulkCostImportIssuesCsv(issues: BulkCostImportIssue[]): string {
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
  "inventory_item_id",
  "variant_id",
  "sku",
  "product_title",
  "variant_title",
  "cost",
] as const;

/**
 * 回滚清单只含真正会被改的行。
 * `cost` 为空表示这个变体导入前就没有成本，回滚时需要手动清空而不是填 0。
 */
export function buildBulkCostImportRollbackCsv(rows: BulkCostImportRow[]): string {
  return toCsv(
    ROLLBACK_CSV_HEADERS,
    rows
      .filter((row) => !row.skipped)
      .map((row) => [
        row.inventoryItemId,
        row.variantId,
        row.sku ?? "",
        row.productTitle,
        row.variantTitle,
        row.beforeCost,
      ]),
  );
}
