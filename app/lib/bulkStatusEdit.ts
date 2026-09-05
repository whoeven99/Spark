/**
 * 商品批量上下架 — 规则、变更计算与 CSV 导出（纯函数，浏览器与服务端共用）。
 *
 * 边界：只负责「给定商品当前状态 + 规则 → 算出目标状态」，不接触 Shopify、不做任何写入。
 * dry-run 任务用它生成 changeset，审核弹窗用同一份数据渲染表格并导出 CSV，
 * 写回执行器只消费 changeset 里已确认的行。
 *
 * 与「批量打标」的区别：标签是增量操作，状态是整体替换，因此回滚清单记录的是原状态值。
 */
import { toCsv } from "./csv";

/** 单次任务的规模硬上限（超过则拒绝创建，避免限流与超时）。 */
export const BULK_STATUS_EDIT_MAX_PRODUCTS = 200;

/**
 * Shopify 的 ProductStatus 在 2025-10 起多了 UNLISTED，未来还可能增加。
 * 读侧原样保留服务端返回值，只有写侧限定在本次支持的两个目标状态。
 */
export type BulkStatusEditTargetStatus = "active" | "draft";

/** 目标状态 → Shopify 枚举值。 */
export const BULK_STATUS_EDIT_TARGET_ENUM: Record<BulkStatusEditTargetStatus, string> = {
  active: "ACTIVE",
  draft: "DRAFT",
};

/**
 * 库存前置条件：把「断货下架」「补货上架」这两个真实工作流表达成规则，
 * 避免商户先手工筛一遍商品再来批量改。
 */
export type BulkStatusEditInventoryCondition = "none" | "out_of_stock_only" | "in_stock_only";

export type BulkStatusEditRule = {
  targetStatus: BulkStatusEditTargetStatus;
  inventoryCondition: BulkStatusEditInventoryCondition;
};

/** 跳过原因稳定码（i18n key 后缀，不要直接展示原始值）。 */
export type BulkStatusEditSkipReason =
  | "no_change"
  | "archived_source"
  | "inventory_condition"
  | "inventory_untracked";

export type BulkStatusEditProductInput = {
  productId: string;
  productTitle: string;
  /** Shopify 返回的原始状态枚举，可能是本文件未列举的新值 */
  status: string;
  totalInventory: number;
  tracksInventory: boolean;
  /** 发布到 Online Store 的时间；null 表示没有发布记录 */
  publishedAt: string | null;
};

export type BulkStatusEditRow = {
  productId: string;
  productTitle: string;
  beforeStatus: string;
  afterStatus: string;
  totalInventory: number;
  tracksInventory: boolean;
  /**
   * 改为 ACTIVE 但没有 Online Store 发布记录。
   * 状态只控制「能不能卖」，销售渠道才决定「店面看不看得到」，
   * 这类商品改完仍可能在店面查无此物，必须在审核表里显式提示。
   */
  needsPublishCheck: boolean;
  skipped: boolean;
  skipReason?: BulkStatusEditSkipReason;
};

export type BulkStatusEditSummary = {
  products: number;
  /** 会产生写入的商品数 */
  changed: number;
  skipped: number;
  toActive: number;
  toDraft: number;
  /** 需要人工确认销售渠道的商品数 */
  needsPublishCheck: number;
};

export type BulkStatusEditApplyOutcome = {
  at: string;
  succeeded: number;
  failed: number;
  errors: Array<{ productId: string; message: string }>;
};

// ─── 规则解析 ─────────────────────────────────────────────────────────────────

const TARGET_STATUSES: readonly BulkStatusEditTargetStatus[] = ["active", "draft"];
const INVENTORY_CONDITIONS: readonly BulkStatusEditInventoryCondition[] = [
  "none",
  "out_of_stock_only",
  "in_stock_only",
];

export class BulkStatusEditRuleError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BulkStatusEditRuleError";
    this.code = code;
  }
}

/**
 * TaskProposal 参数（全是字符串）→ 规则。
 *
 * targetStatus 不设默认值：上架和下架方向相反，猜错一次就是整批商品下线，
 * 宁可报错让用户在卡片里补齐。
 */
export function parseBulkStatusEditRule(params: Record<string, string>): BulkStatusEditRule {
  const rawTarget = (params.targetStatus ?? "").trim().toLowerCase();
  if (!TARGET_STATUSES.includes(rawTarget as BulkStatusEditTargetStatus)) {
    throw new BulkStatusEditRuleError(
      "invalid_target_status",
      "请先选择要把商品改成「上架（Active）」还是「下架为草稿（Draft）」",
    );
  }
  const rawCondition = (params.inventoryCondition ?? "").trim().toLowerCase();
  const inventoryCondition = INVENTORY_CONDITIONS.includes(
    rawCondition as BulkStatusEditInventoryCondition,
  )
    ? (rawCondition as BulkStatusEditInventoryCondition)
    : "none";

  return { targetStatus: rawTarget as BulkStatusEditTargetStatus, inventoryCondition };
}

// ─── 变更计算 ─────────────────────────────────────────────────────────────────

function normalizeStatus(raw: string): string {
  return raw.trim().toUpperCase();
}

/** 单个商品的目标状态计算。纯函数，无 IO，可单测。 */
export function computeProductStatusChange(
  product: BulkStatusEditProductInput,
  rule: BulkStatusEditRule,
): BulkStatusEditRow {
  const beforeStatus = normalizeStatus(product.status);
  const afterStatus = BULK_STATUS_EDIT_TARGET_ENUM[rule.targetStatus];
  const totalInventory = Number.isFinite(product.totalInventory) ? product.totalInventory : 0;

  const base: BulkStatusEditRow = {
    productId: product.productId,
    productTitle: product.productTitle,
    beforeStatus,
    afterStatus,
    totalInventory,
    tracksInventory: product.tracksInventory,
    needsPublishCheck: afterStatus === "ACTIVE" && !product.publishedAt,
    skipped: false,
  };

  const skip = (skipReason: BulkStatusEditSkipReason): BulkStatusEditRow => ({
    ...base,
    afterStatus: beforeStatus,
    needsPublishCheck: false,
    skipped: true,
    skipReason,
  });

  // 归档商品的恢复语义与普通上下架不同（会重新占用销售渠道位），本次不处理
  if (beforeStatus === "ARCHIVED") return skip("archived_source");
  if (beforeStatus === afterStatus) return skip("no_change");

  if (rule.inventoryCondition !== "none") {
    // 不追踪库存的商品 totalInventory 恒为 0，用它判断「断货」会把还能卖的商品下架。
    // 两个方向都跳过并标原因，比猜一个语义更可预测。
    if (!product.tracksInventory) return skip("inventory_untracked");
    if (rule.inventoryCondition === "out_of_stock_only" && totalInventory > 0) {
      return skip("inventory_condition");
    }
    if (rule.inventoryCondition === "in_stock_only" && totalInventory <= 0) {
      return skip("inventory_condition");
    }
  }

  return base;
}

export function buildBulkStatusEditSummary(rows: BulkStatusEditRow[]): BulkStatusEditSummary {
  let changed = 0;
  let skipped = 0;
  let toActive = 0;
  let toDraft = 0;
  let needsPublishCheck = 0;
  for (const row of rows) {
    if (row.skipped) {
      skipped += 1;
      continue;
    }
    changed += 1;
    if (row.afterStatus === "ACTIVE") toActive += 1;
    if (row.afterStatus === "DRAFT") toDraft += 1;
    if (row.needsPublishCheck) needsPublishCheck += 1;
  }
  return { products: rows.length, changed, skipped, toActive, toDraft, needsPublishCheck };
}

// ─── 反序列化 ─────────────────────────────────────────────────────────────────

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** 写回只认这两个目标状态，其它值一律视为脏数据丢弃。 */
const WRITABLE_STATUSES = new Set(["ACTIVE", "DRAFT"]);

/**
 * 从任务 result 读回 changeset 行。
 * 写回入口据此校验：缺 productId、目标状态不在白名单、或前后状态相同的行直接丢弃。
 */
export function coerceBulkStatusEditRows(raw: unknown): BulkStatusEditRow[] {
  if (!Array.isArray(raw)) return [];
  const out: BulkStatusEditRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const productId = asString(r.productId).trim();
    if (!productId) continue;

    const beforeStatus = normalizeStatus(asString(r.beforeStatus));
    const afterStatus = normalizeStatus(asString(r.afterStatus));
    const skipped = r.skipped === true;
    if (!skipped && (!WRITABLE_STATUSES.has(afterStatus) || afterStatus === beforeStatus)) {
      continue;
    }

    const skipReason = asString(r.skipReason).trim();
    out.push({
      productId,
      productTitle: asString(r.productTitle),
      beforeStatus,
      afterStatus,
      totalInventory: asNumber(r.totalInventory),
      tracksInventory: r.tracksInventory === true,
      needsPublishCheck: r.needsPublishCheck === true,
      skipped,
      ...(skipReason ? { skipReason: skipReason as BulkStatusEditSkipReason } : {}),
    });
  }
  return out;
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

const CHANGESET_CSV_HEADERS = [
  "product_title",
  "product_id",
  "before_status",
  "after_status",
  "total_inventory",
  "tracks_inventory",
  "needs_publish_check",
  "action",
  "reason",
] as const;

/** 验收用的变更清单（含被跳过的行与原因），也是人工比对的底稿。 */
export function buildBulkStatusEditChangesetCsv(rows: BulkStatusEditRow[]): string {
  return toCsv(
    CHANGESET_CSV_HEADERS,
    rows.map((row) => [
      row.productTitle,
      row.productId,
      row.beforeStatus,
      row.skipped ? "" : row.afterStatus,
      String(row.totalInventory),
      row.tracksInventory ? "yes" : "no",
      row.skipped || !row.needsPublishCheck ? "" : "yes",
      row.skipped ? "skip" : "change",
      row.skipped ? (row.skipReason ?? "") : "",
    ]),
  );
}

const ROLLBACK_CSV_HEADERS = ["product_id", "product_title", "rollback_status"] as const;

/**
 * 回滚清单：状态是整体替换，撤销就是把原状态写回去。
 * 只列真正会写入的行。
 */
export function buildBulkStatusEditRollbackCsv(rows: BulkStatusEditRow[]): string {
  return toCsv(
    ROLLBACK_CSV_HEADERS,
    rows
      .filter((row) => !row.skipped)
      .map((row) => [row.productId, row.productTitle, row.beforeStatus]),
  );
}
