/**
 * 变体批量调价 — 规则、变更计算与 CSV 导出（纯函数，浏览器与服务端共用）。
 *
 * 边界：本文件只负责「给定当前变体 + 规则 → 算出目标值」，不接触 Shopify、不做任何写入。
 * dry-run 任务用它生成 changeset，审核弹窗用同一份数据渲染表格并导出 CSV，
 * 写回执行器只消费 changeset 里已确认的行。
 *
 * 金额一律以「分」为整数单位参与运算，避免浮点误差累积。
 */
import { toCsv } from "./csv";

/** 单次任务的规模硬上限（超过则拒绝创建，避免限流与超时）。 */
export const BULK_PRICE_EDIT_MAX_PRODUCTS = 200;
export const BULK_PRICE_EDIT_MAX_VARIANTS = 1000;

/** Shopify productVariantsBulkUpdate 单次调用的变体上限。 */
export const BULK_PRICE_EDIT_VARIANTS_PER_MUTATION = 250;

export type BulkPriceEditPriceMode =
  | "percent_down"
  | "percent_up"
  | "amount_down"
  | "amount_up"
  | "set_fixed"
  | "unchanged";

export type BulkPriceEditRounding = "none" | "end99" | "end95" | "integer";

export type BulkPriceEditCompareAtMode = "unchanged" | "original_price" | "clear";

export type BulkPriceEditRule = {
  priceMode: BulkPriceEditPriceMode;
  /** percent_* 为百分数（15 = 15%）；amount_* / set_fixed 为金额；unchanged 时忽略。 */
  priceValue: number;
  rounding: BulkPriceEditRounding;
  compareAtMode: BulkPriceEditCompareAtMode;
  /** 最低价保护：算出的新价低于该值时跳过该变体。null = 不设下限。 */
  minPrice: number | null;
};

/** 跳过原因稳定码（i18n key 后缀，不要直接展示原始值）。 */
export type BulkPriceEditSkipReason =
  | "no_change"
  | "below_min_price"
  | "invalid_price"
  | "missing_price";

/** 变更被部分忽略的备注码。 */
export type BulkPriceEditNote = "compare_at_not_greater";

export type BulkPriceEditVariantInput = {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  price: string | null;
  compareAtPrice: string | null;
};

export type BulkPriceEditRow = {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  beforePrice: string;
  afterPrice: string;
  beforeCompareAt: string | null;
  afterCompareAt: string | null;
  priceChanged: boolean;
  compareAtChanged: boolean;
  skipped: boolean;
  skipReason?: BulkPriceEditSkipReason;
  note?: BulkPriceEditNote;
};

export type BulkPriceEditSummary = {
  products: number;
  variants: number;
  changed: number;
  skipped: number;
};

export type BulkPriceEditApplyOutcome = {
  at: string;
  succeeded: number;
  failed: number;
  errors: Array<{ variantId: string; message: string }>;
};

// ─── 金额工具 ─────────────────────────────────────────────────────────────────

/** 解析 Shopify Money 字符串为分；无法解析返回 null。 */
export function parseMoneyToCents(raw: string | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** 分 → Shopify Money 字符串（两位小数）。 */
export function formatCentsToMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}

function roundCents(cents: number, rounding: BulkPriceEditRounding): number {
  if (rounding === "none") return cents;
  if (rounding === "integer") return Math.round(cents / 100) * 100;

  const tail = rounding === "end99" ? 99 : 95;
  const wholeCents = Math.floor(cents / 100) * 100;
  // 就近取到 x.99 / x.95：下边界（上一个整数减尾差）与上边界（当前整数加尾数）二选一
  const lower = wholeCents - (100 - tail);
  const upper = wholeCents + tail;
  if (lower < 0) return upper;
  return cents - lower <= upper - cents ? lower : upper;
}

function applyPriceMode(currentCents: number, rule: BulkPriceEditRule): number | null {
  const value = rule.priceValue;
  switch (rule.priceMode) {
    case "unchanged":
      return currentCents;
    case "percent_down":
      return Math.round(currentCents * (1 - value / 100));
    case "percent_up":
      return Math.round(currentCents * (1 + value / 100));
    case "amount_down":
      return currentCents - Math.round(value * 100);
    case "amount_up":
      return currentCents + Math.round(value * 100);
    case "set_fixed":
      return Math.round(value * 100);
    default: {
      const exhaustive: never = rule.priceMode;
      return exhaustive;
    }
  }
}

// ─── 规则解析 ─────────────────────────────────────────────────────────────────

const PRICE_MODES: readonly BulkPriceEditPriceMode[] = [
  "percent_down",
  "percent_up",
  "amount_down",
  "amount_up",
  "set_fixed",
  "unchanged",
];
const ROUNDINGS: readonly BulkPriceEditRounding[] = ["none", "end99", "end95", "integer"];
const COMPARE_AT_MODES: readonly BulkPriceEditCompareAtMode[] = [
  "unchanged",
  "original_price",
  "clear",
];

/** 百分比调价的上限，防止「降价 200%」这类明显笔误落到店铺上。 */
export const BULK_PRICE_EDIT_MAX_PERCENT_DOWN = 90;
export const BULK_PRICE_EDIT_MAX_PERCENT_UP = 500;

export class BulkPriceEditRuleError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BulkPriceEditRuleError";
    this.code = code;
  }
}

function parseNumberParam(raw: string | undefined): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed.replace(/[,%\s]/g, ""));
  if (!Number.isFinite(value)) return null;
  return value;
}

/**
 * TaskProposal 参数（全是字符串）→ 规则。非法输入抛 BulkPriceEditRuleError，
 * 由调用方转成用户可读的错误，不做静默兜底（价格写错的代价太高）。
 */
export function parseBulkPriceEditRule(
  params: Record<string, string>,
): BulkPriceEditRule {
  const priceMode = PRICE_MODES.includes(params.priceMode as BulkPriceEditPriceMode)
    ? (params.priceMode as BulkPriceEditPriceMode)
    : "percent_down";
  const rounding = ROUNDINGS.includes(params.rounding as BulkPriceEditRounding)
    ? (params.rounding as BulkPriceEditRounding)
    : "none";
  const compareAtMode = COMPARE_AT_MODES.includes(
    params.compareAtMode as BulkPriceEditCompareAtMode,
  )
    ? (params.compareAtMode as BulkPriceEditCompareAtMode)
    : "unchanged";

  const rawValue = parseNumberParam(params.priceValue);
  let priceValue = 0;
  if (priceMode !== "unchanged") {
    if (rawValue == null || rawValue <= 0) {
      throw new BulkPriceEditRuleError("invalid_price_value", "调价数值必须是大于 0 的数字");
    }
    if (priceMode === "percent_down" && rawValue > BULK_PRICE_EDIT_MAX_PERCENT_DOWN) {
      throw new BulkPriceEditRuleError(
        "percent_down_too_large",
        `降价比例不能超过 ${BULK_PRICE_EDIT_MAX_PERCENT_DOWN}%`,
      );
    }
    if (priceMode === "percent_up" && rawValue > BULK_PRICE_EDIT_MAX_PERCENT_UP) {
      throw new BulkPriceEditRuleError(
        "percent_up_too_large",
        `涨价比例不能超过 ${BULK_PRICE_EDIT_MAX_PERCENT_UP}%`,
      );
    }
    priceValue = rawValue;
  }

  if (priceMode === "unchanged" && compareAtMode === "unchanged") {
    throw new BulkPriceEditRuleError(
      "no_op_rule",
      "价格与划线价都不改，这条规则不会产生任何变更",
    );
  }

  const minPriceRaw = parseNumberParam(params.minPrice);
  const minPrice = minPriceRaw != null && minPriceRaw >= 0 ? minPriceRaw : null;

  return { priceMode, priceValue, rounding, compareAtMode, minPrice };
}

// ─── 变更计算 ─────────────────────────────────────────────────────────────────

/** 单个变体的目标值计算。纯函数，无 IO，可单测。 */
export function computeVariantPriceChange(
  variant: BulkPriceEditVariantInput,
  rule: BulkPriceEditRule,
): BulkPriceEditRow {
  const currentCents = parseMoneyToCents(variant.price);
  const currentCompareAtCents = parseMoneyToCents(variant.compareAtPrice);
  const beforePrice = currentCents != null ? formatCentsToMoney(currentCents) : "";
  const beforeCompareAt =
    currentCompareAtCents != null ? formatCentsToMoney(currentCompareAtCents) : null;

  const base: BulkPriceEditRow = {
    variantId: variant.variantId,
    productId: variant.productId,
    productTitle: variant.productTitle,
    variantTitle: variant.variantTitle,
    sku: variant.sku,
    beforePrice,
    afterPrice: beforePrice,
    beforeCompareAt,
    afterCompareAt: beforeCompareAt,
    priceChanged: false,
    compareAtChanged: false,
    skipped: false,
  };

  if (currentCents == null) {
    return { ...base, skipped: true, skipReason: "missing_price" };
  }

  const rawNextCents = applyPriceMode(currentCents, rule);
  if (rawNextCents == null) {
    return { ...base, skipped: true, skipReason: "invalid_price" };
  }
  const nextCents =
    rule.priceMode === "unchanged" ? currentCents : roundCents(rawNextCents, rule.rounding);

  if (nextCents <= 0) {
    return { ...base, skipped: true, skipReason: "invalid_price" };
  }
  if (rule.minPrice != null && nextCents < Math.round(rule.minPrice * 100)) {
    return { ...base, skipped: true, skipReason: "below_min_price" };
  }

  const priceChanged = nextCents !== currentCents;

  let afterCompareAtCents: number | null = currentCompareAtCents;
  let compareAtChanged = false;
  let note: BulkPriceEditNote | undefined;

  if (rule.compareAtMode === "clear") {
    afterCompareAtCents = null;
    compareAtChanged = currentCompareAtCents != null;
  } else if (rule.compareAtMode === "original_price") {
    // 划线价低于或等于新价时店面不会显示折扣，写进去只会造成误解 —— 保持原值并记备注
    if (currentCents > nextCents) {
      afterCompareAtCents = currentCents;
      compareAtChanged = currentCompareAtCents !== currentCents;
    } else {
      note = "compare_at_not_greater";
    }
  }

  if (!priceChanged && !compareAtChanged) {
    return {
      ...base,
      afterPrice: formatCentsToMoney(nextCents),
      skipped: true,
      skipReason: "no_change",
      ...(note ? { note } : {}),
    };
  }

  return {
    ...base,
    afterPrice: formatCentsToMoney(nextCents),
    afterCompareAt: afterCompareAtCents != null ? formatCentsToMoney(afterCompareAtCents) : null,
    priceChanged,
    compareAtChanged,
    ...(note ? { note } : {}),
  };
}

export function buildBulkPriceEditSummary(rows: BulkPriceEditRow[]): BulkPriceEditSummary {
  const productIds = new Set<string>();
  let changed = 0;
  let skipped = 0;
  for (const row of rows) {
    productIds.add(row.productId);
    if (row.skipped) skipped += 1;
    else changed += 1;
  }
  return { products: productIds.size, variants: rows.length, changed, skipped };
}

// ─── 反序列化 ─────────────────────────────────────────────────────────────────

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asNullableString(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

/**
 * 从任务 result 读回 changeset 行。
 * 写回入口据此校验，缺少 variantId 或价格格式非法的行直接丢弃 —— 不能拿脏数据去改店铺价格。
 */
export function coerceBulkPriceEditRows(raw: unknown): BulkPriceEditRow[] {
  if (!Array.isArray(raw)) return [];
  const out: BulkPriceEditRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const variantId = asString(r.variantId).trim();
    const productId = asString(r.productId).trim();
    if (!variantId || !productId) continue;

    const skipped = r.skipped === true;
    const priceChanged = r.priceChanged === true;
    const compareAtChanged = r.compareAtChanged === true;
    const afterPrice = asString(r.afterPrice).trim();
    const afterCompareAt = asNullableString(r.afterCompareAt);

    // 声明要改价却给不出合法金额的行不可信，整行丢弃
    if (priceChanged && parseMoneyToCents(afterPrice) == null) continue;
    if (compareAtChanged && afterCompareAt != null && parseMoneyToCents(afterCompareAt) == null) {
      continue;
    }

    const skipReason = asString(r.skipReason).trim();
    const note = asString(r.note).trim();
    out.push({
      variantId,
      productId,
      productTitle: asString(r.productTitle),
      variantTitle: asString(r.variantTitle),
      sku: asNullableString(r.sku),
      beforePrice: asString(r.beforePrice),
      afterPrice,
      beforeCompareAt: asNullableString(r.beforeCompareAt),
      afterCompareAt,
      priceChanged,
      compareAtChanged,
      skipped,
      ...(skipReason ? { skipReason: skipReason as BulkPriceEditSkipReason } : {}),
      ...(note ? { note: note as BulkPriceEditNote } : {}),
    });
  }
  return out;
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

const CHANGESET_CSV_HEADERS = [
  "product_title",
  "variant_title",
  "sku",
  "variant_id",
  "before_price",
  "after_price",
  "before_compare_at_price",
  "after_compare_at_price",
  "action",
  "reason",
] as const;

/** 验收用的变更清单（含被跳过的行与原因），也是人工比对的底稿。 */
export function buildBulkPriceEditChangesetCsv(rows: BulkPriceEditRow[]): string {
  return toCsv(
    CHANGESET_CSV_HEADERS,
    rows.map((row) => [
      row.productTitle,
      row.variantTitle,
      row.sku ?? "",
      row.variantId,
      row.beforePrice,
      row.skipped ? "" : row.afterPrice,
      row.beforeCompareAt ?? "",
      row.skipped ? "" : (row.afterCompareAt ?? ""),
      row.skipped ? "skip" : "change",
      row.skipped ? (row.skipReason ?? "") : (row.note ?? ""),
    ]),
  );
}

const ROLLBACK_CSV_HEADERS = [
  "variant_id",
  "product_title",
  "variant_title",
  "sku",
  "price",
  "compare_at_price",
] as const;

/**
 * 回滚底稿：只含会被真正写入的行，值为写入前的原值。
 * 商户可据此人工还原（或再跑一次「设为固定价」）。
 */
export function buildBulkPriceEditRollbackCsv(rows: BulkPriceEditRow[]): string {
  return toCsv(
    ROLLBACK_CSV_HEADERS,
    rows
      .filter((row) => !row.skipped)
      .map((row) => [
        row.variantId,
        row.productTitle,
        row.variantTitle,
        row.sku ?? "",
        row.beforePrice,
        row.beforeCompareAt ?? "",
      ]),
  );
}
