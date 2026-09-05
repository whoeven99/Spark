/**
 * 商品批量入 / 出 Collection — 规则、变更计算与 CSV 导出（纯函数，浏览器与服务端共用）。
 *
 * 边界：只负责「给定商品当前是否在合集里 + 规则 → 算出目标归属」，不接触 Shopify、不做任何写入。
 * dry-run 任务用它生成 changeset，审核弹窗用同一份数据渲染表格并导出 CSV，
 * 写回执行器只消费 changeset 里已确认的行。
 *
 * 与「批量打标」的区别：标签存在商品上，合集归属存在合集上，因此规则里必须带 collectionId，
 * 且只对**手动合集**成立——规则驱动的智能合集成员由条件决定，不能手动增删。
 */
import { toCsv } from "./csv";

/** 单次任务的规模硬上限（超过则拒绝创建，避免限流与超时）。 */
export const BULK_COLLECTION_EDIT_MAX_PRODUCTS = 200;

export type BulkCollectionEditAction = "add" | "remove";

export type BulkCollectionEditRule = {
  action: BulkCollectionEditAction;
  collectionId: string;
};

/** 跳过原因稳定码（i18n key 后缀，不要直接展示原始值）。 */
export type BulkCollectionEditSkipReason = "already_in" | "not_in";

export type BulkCollectionEditProductInput = {
  productId: string;
  productTitle: string;
  /** Shopify 返回的原始状态枚举，仅用于审核表展示 */
  status: string;
  inCollection: boolean;
};

export type BulkCollectionEditRow = {
  productId: string;
  productTitle: string;
  status: string;
  beforeInCollection: boolean;
  afterInCollection: boolean;
  skipped: boolean;
  skipReason?: BulkCollectionEditSkipReason;
};

export type BulkCollectionEditSummary = {
  products: number;
  /** 会产生写入的商品数 */
  changed: number;
  skipped: number;
  added: number;
  removed: number;
};

export type BulkCollectionEditApplyOutcome = {
  at: string;
  succeeded: number;
  failed: number;
  errors: Array<{ productId: string; message: string }>;
  /**
   * 移出合集走 Shopify 异步 Job，轮询预算用尽仍未完成时为 true。
   * 此时 succeeded 只代表「已提交且未报错」，不代表 Shopify 那边已经落地。
   */
  pendingJob?: boolean;
};

// ─── 规则解析 ─────────────────────────────────────────────────────────────────

const ACTIONS: readonly BulkCollectionEditAction[] = ["add", "remove"];

const COLLECTION_GID_PREFIX = "gid://shopify/Collection/";

export class BulkCollectionEditRuleError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BulkCollectionEditRuleError";
    this.code = code;
  }
}

/**
 * TaskProposal 参数（全是字符串）→ 规则。
 *
 * action 不设默认值：加入和移出方向相反，猜错一次就是整批商品从合集里消失，
 * 宁可报错让用户在卡片里补齐。
 */
export function parseBulkCollectionEditRule(
  params: Record<string, string>,
): BulkCollectionEditRule {
  const rawAction = (params.collectionAction ?? "").trim().toLowerCase();
  if (!ACTIONS.includes(rawAction as BulkCollectionEditAction)) {
    throw new BulkCollectionEditRuleError(
      "invalid_action",
      "请先选择要把商品「加入合集」还是「移出合集」",
    );
  }

  const collectionId = (params.collectionId ?? "").trim();
  if (!collectionId) {
    throw new BulkCollectionEditRuleError("missing_collection", "请先选择目标合集");
  }
  if (!collectionId.startsWith(COLLECTION_GID_PREFIX)) {
    throw new BulkCollectionEditRuleError("invalid_collection", "目标合集标识无效，请重新选择合集");
  }

  return { action: rawAction as BulkCollectionEditAction, collectionId };
}

// ─── 变更计算 ─────────────────────────────────────────────────────────────────

/** 单个商品的合集归属计算。纯函数，无 IO，可单测。 */
export function computeProductCollectionChange(
  product: BulkCollectionEditProductInput,
  rule: BulkCollectionEditRule,
): BulkCollectionEditRow {
  const targetInCollection = rule.action === "add";
  const base: BulkCollectionEditRow = {
    productId: product.productId,
    productTitle: product.productTitle,
    status: product.status.trim().toUpperCase(),
    beforeInCollection: product.inCollection,
    afterInCollection: targetInCollection,
    skipped: false,
  };

  if (product.inCollection === targetInCollection) {
    return {
      ...base,
      afterInCollection: product.inCollection,
      skipped: true,
      skipReason: rule.action === "add" ? "already_in" : "not_in",
    };
  }

  return base;
}

export function buildBulkCollectionEditSummary(
  rows: BulkCollectionEditRow[],
): BulkCollectionEditSummary {
  let changed = 0;
  let skipped = 0;
  let added = 0;
  let removed = 0;
  for (const row of rows) {
    if (row.skipped) {
      skipped += 1;
      continue;
    }
    changed += 1;
    if (row.afterInCollection) added += 1;
    else removed += 1;
  }
  return { products: rows.length, changed, skipped, added, removed };
}

// ─── 反序列化 ─────────────────────────────────────────────────────────────────

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * 从任务 result 读回 changeset 行。
 * 写回入口据此校验：缺 productId、或前后归属相同的行直接丢弃。
 */
export function coerceBulkCollectionEditRows(raw: unknown): BulkCollectionEditRow[] {
  if (!Array.isArray(raw)) return [];
  const out: BulkCollectionEditRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const productId = asString(r.productId).trim();
    if (!productId) continue;

    const beforeInCollection = r.beforeInCollection === true;
    const afterInCollection = r.afterInCollection === true;
    const skipped = r.skipped === true;
    if (!skipped && beforeInCollection === afterInCollection) continue;

    const skipReason = asString(r.skipReason).trim();
    out.push({
      productId,
      productTitle: asString(r.productTitle),
      status: asString(r.status).trim().toUpperCase(),
      beforeInCollection,
      afterInCollection,
      skipped,
      ...(skipReason ? { skipReason: skipReason as BulkCollectionEditSkipReason } : {}),
    });
  }
  return out;
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

const CHANGESET_CSV_HEADERS = [
  "product_title",
  "product_id",
  "product_status",
  "collection_title",
  "collection_id",
  "before_in_collection",
  "after_in_collection",
  "action",
  "reason",
] as const;

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

/** 验收用的变更清单（含被跳过的行与原因），也是人工比对的底稿。 */
export function buildBulkCollectionEditChangesetCsv(
  rows: BulkCollectionEditRow[],
  collection: { id: string; title: string },
): string {
  return toCsv(
    CHANGESET_CSV_HEADERS,
    rows.map((row) => [
      row.productTitle,
      row.productId,
      row.status,
      collection.title,
      collection.id,
      yesNo(row.beforeInCollection),
      row.skipped ? "" : yesNo(row.afterInCollection),
      row.skipped ? "skip" : row.afterInCollection ? "add" : "remove",
      row.skipped ? (row.skipReason ?? "") : "",
    ]),
  );
}

const ROLLBACK_CSV_HEADERS = [
  "product_id",
  "product_title",
  "collection_id",
  "rollback_action",
] as const;

/**
 * 回滚清单：合集归属是布尔值，撤销就是做相反的那一步。
 * 只列真正会写入的行。
 */
export function buildBulkCollectionEditRollbackCsv(
  rows: BulkCollectionEditRow[],
  collection: { id: string; title: string },
): string {
  return toCsv(
    ROLLBACK_CSV_HEADERS,
    rows
      .filter((row) => !row.skipped)
      .map((row) => [
        row.productId,
        row.productTitle,
        collection.id,
        // 加进去的要移出来，移出去的要加回去
        row.beforeInCollection ? "add" : "remove",
      ]),
  );
}
