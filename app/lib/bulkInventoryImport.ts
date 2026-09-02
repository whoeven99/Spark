/**
 * 库存导入 — 列映射、匹配分类、变更试算与 CSV（纯函数，浏览器与服务端共用）。
 *
 * 和另外两个表格导入的分工：价目表导入改买家看到的售价，成本价导入改只影响利润报表的
 * 单位成本，这边改的是**某个地点的可售库存**。三者风险与 mutation 都不同，
 * 因此是三个独立任务类型、三个独立写回执行器，不要合并成一个「通用导入」。
 *
 * 几条定死的语义（都是和用户确认过的，改动前先回头看）：
 *   - 只写 `available`（可售量），不写 `on_hand`。商户说「把库存设成 50」指的是能卖 50 个。
 *   - 绝对值覆盖，不做加减。
 *   - 一次任务只针对**一个地点**，地点由用户在卡片里选。
 *   - 变体没在该地点建库存记录（没有 InventoryLevel）时报错跳过，不自动激活地点——
 *     那会静默改变这个商品的可发货地点配置。
 *   - 不追踪库存的变体（`tracked = false`）跳过，不自动打开追踪。
 *
 * 本文件不接触 Shopify、不做任何写入；匹配所需的变体数据由调用方读好后传进来。
 */
import { toCsv } from "./csv";
import {
  normalizeSku,
  parseImportQuantity,
  SHEET_IMPORT_MAX_ROWS,
  SHEET_IMPORT_MIN_MATCH_RATE,
  SheetImportMappingError,
  skuKey,
  validateColumnsAgainstHeaders,
  type SheetRow,
} from "./sheetImport";

export const BULK_INVENTORY_IMPORT_MAX_ROWS = SHEET_IMPORT_MAX_ROWS;
export const BULK_INVENTORY_IMPORT_MIN_MATCH_RATE = SHEET_IMPORT_MIN_MATCH_RATE;

/**
 * 单行库存变化超过这个绝对值时打备注。
 * 主要用来抓「把金额列当库存列选了」——那种表里动辄几千上万，
 * 但列名校验和匹配率都拦不住（SKU 列选对了，数值列选错了）。
 */
export const BULK_INVENTORY_IMPORT_LARGE_DELTA = 1000;

export type BulkInventoryImportMapping = {
  skuColumn: string;
  quantityColumn: string;
};

/** 行级问题码（i18n key 后缀）。这些行不会写回。 */
export type BulkInventoryImportIssueReason =
  | "missing_sku"
  | "missing_quantity"
  | "invalid_quantity"
  | "duplicate_sku_in_file"
  | "sku_not_found"
  | "sku_matches_multiple"
  | "no_inventory_item"
  | "not_tracked"
  | "not_stocked_at_location";

export type BulkInventoryImportIssue = {
  sourceRow: number;
  sku: string;
  reason: BulkInventoryImportIssueReason;
  /** 原始单元格文本，方便用户回表格里定位 */
  raw?: string;
};

/**
 * 行级备注。和 issue 的区别：备注只警告，不阻止写回。
 * `large_delta`：这一行的增减幅度大到可疑，多半是列选错或手滑多打零。
 */
export type BulkInventoryImportNote = "large_delta";

export type BulkInventoryImportRow = {
  sourceRow: number;
  /** InventoryItem 的 gid，写回时用它，不是 variantId */
  inventoryItemId: string;
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  /** 试算时读到的该地点可售量；写回时作为 CAS 比较基准 */
  beforeQuantity: number;
  afterQuantity: number;
  skipped: boolean;
  skipReason?: "no_change";
  notes?: BulkInventoryImportNote[];
};

export type BulkInventoryImportSummary = {
  /** 表格里的有效数据行数 */
  sheetRows: number;
  matched: number;
  changed: number;
  unchanged: number;
  /** 未匹配 + 数据非法的行数 */
  issues: number;
  /** 会增加的总件数与会减少的总件数（都取正值） */
  increaseUnits: number;
  decreaseUnits: number;
};

export type BulkInventoryImportEntry = {
  sourceRow: number;
  sku: string;
  quantity: number;
};

export type BulkInventoryImportVariant = {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  inventoryItemId: string | null;
  /** InventoryItem.tracked：false 时设量没有意义 */
  tracked: boolean;
  /** 所选地点的可售量；null 表示该地点没有这个变体的库存记录 */
  availableAtLocation: number | null;
};

export type BulkInventoryImportApplyOutcome = {
  at: string;
  succeeded: number;
  failed: number;
  errors: Array<{ inventoryItemId: string; message: string }>;
  /**
   * 因为「库存在试算之后被改过」而拒绝写入的行数。
   * 这不是故障，是并发保护生效了；UI 要单独讲清楚，让用户重新试算而不是以为出 bug 了。
   */
  staleCount: number;
};

// ─── 映射解析 ─────────────────────────────────────────────────────────────────

export function parseBulkInventoryImportMapping(
  params: Record<string, string>,
): BulkInventoryImportMapping {
  const skuColumn = (params.skuColumn ?? "").trim();
  const quantityColumn = (params.quantityColumn ?? "").trim();

  if (!skuColumn) {
    throw new SheetImportMappingError("missing_sku_column", "请填写表格里的 SKU 列名");
  }
  if (!quantityColumn) {
    throw new SheetImportMappingError("missing_quantity_column", "请填写表格里的库存数量列名");
  }
  if (skuColumn === quantityColumn) {
    throw new SheetImportMappingError("duplicate_column", "SKU 列与库存数量列不能是同一列");
  }

  return { skuColumn, quantityColumn };
}

export function validateInventoryMappingAgainstHeaders(
  mapping: BulkInventoryImportMapping,
  headers: string[],
): void {
  validateColumnsAgainstHeaders([mapping.skuColumn, mapping.quantityColumn], headers);
}

/** 目标地点必须是 Location GID，不能拿商品或库存项的 gid 冒充。 */
const LOCATION_GID_PREFIX = "gid://shopify/Location/";

export function parseBulkInventoryImportLocationId(params: Record<string, string>): string {
  const locationId = (params.locationId ?? "").trim();
  if (!locationId) {
    throw new SheetImportMappingError("missing_location", "请先选择要导入库存的地点");
  }
  if (!locationId.startsWith(LOCATION_GID_PREFIX)) {
    throw new SheetImportMappingError("invalid_location", "地点标识无效，请重新选择地点");
  }
  return locationId;
}

// ─── 行解析 ───────────────────────────────────────────────────────────────────

/**
 * 表格行 → 导入条目。
 * 同一个 SKU 在文件里出现多次时全部作废（数量不一致时无从判断以哪行为准）。
 */
export function buildBulkInventoryImportEntries(
  rows: SheetRow[],
  mapping: BulkInventoryImportMapping,
): { entries: BulkInventoryImportEntry[]; issues: BulkInventoryImportIssue[] } {
  const issues: BulkInventoryImportIssue[] = [];
  const staged: BulkInventoryImportEntry[] = [];

  for (const row of rows) {
    const sku = normalizeSku(row.cells[mapping.skuColumn] ?? "");
    if (!sku) {
      issues.push({ sourceRow: row.sourceRow, sku: "", reason: "missing_sku" });
      continue;
    }

    const rawQuantity = row.cells[mapping.quantityColumn] ?? "";
    if (!rawQuantity.trim()) {
      issues.push({ sourceRow: row.sourceRow, sku, reason: "missing_quantity" });
      continue;
    }
    const quantity = parseImportQuantity(rawQuantity);
    if (quantity == null) {
      issues.push({
        sourceRow: row.sourceRow,
        sku,
        reason: "invalid_quantity",
        raw: rawQuantity,
      });
      continue;
    }

    staged.push({ sourceRow: row.sourceRow, sku, quantity });
  }

  const countBySku = new Map<string, number>();
  for (const entry of staged) {
    const key = skuKey(entry.sku);
    countBySku.set(key, (countBySku.get(key) ?? 0) + 1);
  }

  const entries: BulkInventoryImportEntry[] = [];
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

/**
 * 把导入条目和店铺变体对起来。
 * SKU 在 Shopify 里不保证唯一，命中多个变体时不猜、整行跳过并报冲突。
 */
export function computeBulkInventoryImportRows(
  entries: BulkInventoryImportEntry[],
  variants: BulkInventoryImportVariant[],
): { rows: BulkInventoryImportRow[]; issues: BulkInventoryImportIssue[] } {
  const bySku = new Map<string, BulkInventoryImportVariant[]>();
  for (const variant of variants) {
    if (!variant.sku) continue;
    const key = skuKey(variant.sku);
    const list = bySku.get(key);
    if (list) list.push(variant);
    else bySku.set(key, [variant]);
  }

  const rows: BulkInventoryImportRow[] = [];
  const issues: BulkInventoryImportIssue[] = [];

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
    // 库存挂在 InventoryItem 上，没有它就没法写回
    if (!variant.inventoryItemId) {
      issues.push({ sourceRow: entry.sourceRow, sku: entry.sku, reason: "no_inventory_item" });
      continue;
    }
    // 不追踪库存的变体永远按「有货」售卖，设数量既写不进去也没有意义
    if (!variant.tracked) {
      issues.push({ sourceRow: entry.sourceRow, sku: entry.sku, reason: "not_tracked" });
      continue;
    }
    // 没有 InventoryLevel 就是没在这个地点备货；激活地点是另一回事，不在本能力范围
    if (variant.availableAtLocation == null) {
      issues.push({
        sourceRow: entry.sourceRow,
        sku: entry.sku,
        reason: "not_stocked_at_location",
      });
      continue;
    }

    const base: BulkInventoryImportRow = {
      sourceRow: entry.sourceRow,
      inventoryItemId: variant.inventoryItemId,
      variantId: variant.variantId,
      productId: variant.productId,
      productTitle: variant.productTitle,
      variantTitle: variant.variantTitle,
      sku: variant.sku,
      beforeQuantity: variant.availableAtLocation,
      afterQuantity: entry.quantity,
      skipped: false,
    };

    if (variant.availableAtLocation === entry.quantity) {
      rows.push({ ...base, skipped: true, skipReason: "no_change" });
      continue;
    }

    const notes: BulkInventoryImportNote[] =
      Math.abs(entry.quantity - variant.availableAtLocation) >= BULK_INVENTORY_IMPORT_LARGE_DELTA
        ? ["large_delta"]
        : [];

    rows.push({ ...base, ...(notes.length > 0 ? { notes } : {}) });
  }

  return { rows, issues };
}

export function buildBulkInventoryImportSummary(
  sheetRows: number,
  rows: BulkInventoryImportRow[],
  issues: BulkInventoryImportIssue[],
): BulkInventoryImportSummary {
  let changed = 0;
  let unchanged = 0;
  let increaseUnits = 0;
  let decreaseUnits = 0;
  for (const row of rows) {
    if (row.skipped) {
      unchanged += 1;
      continue;
    }
    changed += 1;
    const delta = row.afterQuantity - row.beforeQuantity;
    if (delta > 0) increaseUnits += delta;
    else decreaseUnits += -delta;
  }
  return {
    sheetRows,
    matched: rows.length,
    changed,
    unchanged,
    issues: issues.length,
    increaseUnits,
    decreaseUnits,
  };
}

/** 匹配率：撞上店铺变体的行 ÷ 表格有效行。用于判断列映射是不是选错了。 */
export function computeInventoryMatchRate(summary: BulkInventoryImportSummary): number {
  if (summary.sheetRows === 0) return 0;
  return summary.matched / summary.sheetRows;
}

// ─── 反序列化 ─────────────────────────────────────────────────────────────────

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asInteger(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) ? v : null;
}

const NOTE_VALUES = new Set<string>(["large_delta"]);

/**
 * 从任务 result 读回可写回的行。写回执行器只信这里产出的结构，
 * 缺 inventoryItemId 或数量不是整数的行一律丢弃。
 */
export function coerceBulkInventoryImportRows(raw: unknown): BulkInventoryImportRow[] {
  if (!Array.isArray(raw)) return [];
  const out: BulkInventoryImportRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const inventoryItemId = asString(r.inventoryItemId).trim();
    if (!inventoryItemId) continue;
    const beforeQuantity = asInteger(r.beforeQuantity);
    const afterQuantity = asInteger(r.afterQuantity);
    if (beforeQuantity == null || afterQuantity == null) continue;

    const notes = Array.isArray(r.notes)
      ? r.notes.filter((n): n is BulkInventoryImportNote => NOTE_VALUES.has(asString(n)))
      : [];

    out.push({
      sourceRow: typeof r.sourceRow === "number" ? r.sourceRow : 0,
      inventoryItemId,
      variantId: asString(r.variantId),
      productId: asString(r.productId),
      productTitle: asString(r.productTitle),
      variantTitle: asString(r.variantTitle),
      sku: asString(r.sku) || null,
      beforeQuantity,
      afterQuantity,
      skipped: r.skipped === true,
      ...(asString(r.skipReason) ? { skipReason: "no_change" as const } : {}),
      ...(notes.length > 0 ? { notes } : {}),
    });
  }
  return out;
}

export function coerceBulkInventoryImportIssues(raw: unknown): BulkInventoryImportIssue[] {
  if (!Array.isArray(raw)) return [];
  const out: BulkInventoryImportIssue[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const reason = asString(r.reason).trim();
    if (!reason) continue;
    out.push({
      sourceRow: typeof r.sourceRow === "number" ? r.sourceRow : 0,
      sku: asString(r.sku),
      reason: reason as BulkInventoryImportIssueReason,
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
  "inventory_item_id",
  "location_id",
  "before_available",
  "after_available",
  "delta",
  "action",
  "reason",
  "notes",
] as const;

export function buildBulkInventoryImportChangesetCsv(
  rows: BulkInventoryImportRow[],
  location: { id: string },
): string {
  return toCsv(
    CHANGESET_CSV_HEADERS,
    rows.map((row) => [
      String(row.sourceRow),
      row.sku ?? "",
      row.productTitle,
      row.variantTitle,
      row.inventoryItemId,
      location.id,
      String(row.beforeQuantity),
      row.skipped ? "" : String(row.afterQuantity),
      row.skipped ? "" : String(row.afterQuantity - row.beforeQuantity),
      row.skipped ? "skip" : "change",
      row.skipped ? (row.skipReason ?? "") : "",
      (row.notes ?? []).join("|"),
    ]),
  );
}

const ISSUES_CSV_HEADERS = ["source_row", "sku", "reason", "raw_value"] as const;

/** 未写入的行：表格里有但没落到店铺上的部分，是这个功能最需要交代清楚的东西。 */
export function buildBulkInventoryImportIssuesCsv(issues: BulkInventoryImportIssue[]): string {
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
  "location_id",
  "available",
] as const;

/**
 * 回滚清单只含真正会被改的行，`available` 是导入前的可售量。
 * 注意回滚不是「再导一次就回去了」：期间发生的销量会让实际库存继续变化，
 * 这份清单是人工核对的底稿，不是自动撤销脚本。
 */
export function buildBulkInventoryImportRollbackCsv(
  rows: BulkInventoryImportRow[],
  location: { id: string },
): string {
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
        location.id,
        String(row.beforeQuantity),
      ]),
  );
}
