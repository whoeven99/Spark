/**
 * 商品批量打标 — 规则、变更计算与 CSV 导出（纯函数，浏览器与服务端共用）。
 *
 * 边界：只负责「给定当前标签 + 规则 → 算出目标标签」，不接触 Shopify、不做任何写入。
 * dry-run 任务用它生成 changeset，审核弹窗用同一份数据渲染表格并导出 CSV，
 * 写回执行器只消费 changeset 里已确认的行。
 *
 * 标签在 Shopify 里大小写不敏感（`Sale` 与 `sale` 视为同一个）但会保留写入时的大小写，
 * 因此全部比较走小写 key，展示与写入用原始形态。
 */
import { toCsv } from "./csv";

/** 单次任务的规模硬上限（超过则拒绝创建，避免限流与超时）。 */
export const BULK_TAG_EDIT_MAX_PRODUCTS = 200;

/** Shopify 单个商品的标签数量上限。 */
export const BULK_TAG_EDIT_MAX_TAGS_PER_PRODUCT = 250;

/** 单条规则里最多能写多少个标签 / 前缀，防止误粘贴一整列。 */
export const BULK_TAG_EDIT_MAX_RULE_TAGS = 50;

/** 前缀清理的最短长度：太短（如 "a"）会误伤大量无关标签。 */
export const BULK_TAG_EDIT_MIN_PREFIX_LENGTH = 2;

/** 单个标签的最大长度（Shopify 限制）。 */
export const BULK_TAG_EDIT_MAX_TAG_LENGTH = 255;

export type BulkTagEditRule = {
  /** 要添加的标签（保留原始大小写） */
  addTags: string[];
  /** 要移除的标签（按小写匹配） */
  removeTags: string[];
  /** 按前缀移除，如 "sale-" 会清掉 sale-2026 / SALE-summer */
  removePrefixes: string[];
};

/** 跳过原因稳定码（i18n key 后缀，不要直接展示原始值）。 */
export type BulkTagEditSkipReason = "no_change" | "too_many_tags";

export type BulkTagEditProductInput = {
  productId: string;
  productTitle: string;
  tags: string[];
};

export type BulkTagEditRow = {
  productId: string;
  productTitle: string;
  beforeTags: string[];
  afterTags: string[];
  addedTags: string[];
  removedTags: string[];
  skipped: boolean;
  skipReason?: BulkTagEditSkipReason;
};

export type BulkTagEditSummary = {
  products: number;
  /** 会产生写入的商品数 */
  changed: number;
  skipped: number;
  /** 标签操作次数合计（不是商品数） */
  added: number;
  removed: number;
};

export type BulkTagEditApplyOutcome = {
  at: string;
  succeeded: number;
  failed: number;
  errors: Array<{ productId: string; message: string }>;
};

// ─── 标签工具 ─────────────────────────────────────────────────────────────────

/** 比较用 key：Shopify 标签大小写不敏感。 */
export function tagKey(tag: string): string {
  return tag.trim().toLowerCase();
}

/** 去空、去重（按 key 保留首次出现的大小写形态）。 */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = tagKey(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

// ─── 规则解析 ─────────────────────────────────────────────────────────────────

export class BulkTagEditRuleError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BulkTagEditRuleError";
    this.code = code;
  }
}

/**
 * 逗号分隔的标签串 → 数组。
 * Shopify 用逗号分隔标签，所以标签本身不允许含逗号，这里按逗号切开即可。
 */
function splitTagList(raw: string | undefined): string[] {
  if (typeof raw !== "string") return [];
  return normalizeTags(raw.split(","));
}

function assertTagListValid(tags: string[], field: string): void {
  if (tags.length > BULK_TAG_EDIT_MAX_RULE_TAGS) {
    throw new BulkTagEditRuleError(
      "too_many_rule_tags",
      `${field}最多只能填 ${BULK_TAG_EDIT_MAX_RULE_TAGS} 个`,
    );
  }
  for (const tag of tags) {
    if (tag.length > BULK_TAG_EDIT_MAX_TAG_LENGTH) {
      throw new BulkTagEditRuleError(
        "tag_too_long",
        `标签「${tag.slice(0, 20)}…」超过 ${BULK_TAG_EDIT_MAX_TAG_LENGTH} 个字符`,
      );
    }
  }
}

/**
 * TaskProposal 参数（全是字符串）→ 规则。
 * 非法输入抛 BulkTagEditRuleError，由调用方转成用户可读的错误，不做静默兜底。
 */
export function parseBulkTagEditRule(params: Record<string, string>): BulkTagEditRule {
  const addTags = splitTagList(params.addTags);
  const removeTags = splitTagList(params.removeTags);
  const removePrefixes = splitTagList(params.removePrefixes);

  assertTagListValid(addTags, "要添加的标签");
  assertTagListValid(removeTags, "要移除的标签");
  assertTagListValid(removePrefixes, "要清理的前缀");

  for (const prefix of removePrefixes) {
    if (prefix.length < BULK_TAG_EDIT_MIN_PREFIX_LENGTH) {
      throw new BulkTagEditRuleError(
        "prefix_too_short",
        `前缀「${prefix}」太短，至少 ${BULK_TAG_EDIT_MIN_PREFIX_LENGTH} 个字符，否则会误删大量标签`,
      );
    }
  }

  if (addTags.length === 0 && removeTags.length === 0 && removePrefixes.length === 0) {
    throw new BulkTagEditRuleError(
      "no_op_rule",
      "请至少填写要添加的标签、要移除的标签或要清理的前缀",
    );
  }

  // 同一个标签既加又减是矛盾指令，宁可报错也不要猜用户想要哪个
  const addKeys = new Set(addTags.map(tagKey));
  const conflict = removeTags.find((tag) => addKeys.has(tagKey(tag)));
  if (conflict) {
    throw new BulkTagEditRuleError(
      "conflicting_tag",
      `标签「${conflict}」同时出现在添加和移除里，请只保留一个`,
    );
  }

  return { addTags, removeTags, removePrefixes };
}

/** 规则是否只做移除（用于文案与风险提示）。 */
export function isRemoveOnlyRule(rule: BulkTagEditRule): boolean {
  return rule.addTags.length === 0;
}

// ─── 变更计算 ─────────────────────────────────────────────────────────────────

/** 单个商品的目标标签计算。纯函数，无 IO，可单测。 */
export function computeProductTagChange(
  product: BulkTagEditProductInput,
  rule: BulkTagEditRule,
): BulkTagEditRow {
  const beforeTags = normalizeTags(product.tags);
  const addKeys = new Set(rule.addTags.map(tagKey));
  const removeKeys = new Set(rule.removeTags.map(tagKey));
  const prefixKeys = rule.removePrefixes.map(tagKey);

  const shouldRemove = (tag: string): boolean => {
    const key = tagKey(tag);
    // 本轮要加回来的标签不参与移除：加优先于减，且不会在清单里既显示移除又显示添加
    if (addKeys.has(key)) return false;
    if (removeKeys.has(key)) return true;
    return prefixKeys.some((prefix) => key.startsWith(prefix));
  };

  const removedTags = beforeTags.filter(shouldRemove);
  const keptTags = beforeTags.filter((tag) => !shouldRemove(tag));
  const keptKeys = new Set(keptTags.map(tagKey));
  const addedTags = rule.addTags.filter((tag) => !keptKeys.has(tagKey(tag)));
  const afterTags = [...keptTags, ...addedTags];

  const base: BulkTagEditRow = {
    productId: product.productId,
    productTitle: product.productTitle,
    beforeTags,
    afterTags,
    addedTags,
    removedTags,
    skipped: false,
  };

  if (afterTags.length > BULK_TAG_EDIT_MAX_TAGS_PER_PRODUCT) {
    return { ...base, afterTags: beforeTags, addedTags: [], removedTags: [], skipped: true, skipReason: "too_many_tags" };
  }
  if (addedTags.length === 0 && removedTags.length === 0) {
    return { ...base, skipped: true, skipReason: "no_change" };
  }
  return base;
}

export function buildBulkTagEditSummary(rows: BulkTagEditRow[]): BulkTagEditSummary {
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
    added += row.addedTags.length;
    removed += row.removedTags.length;
  }
  return { products: rows.length, changed, skipped, added, removed };
}

// ─── 反序列化 ─────────────────────────────────────────────────────────────────

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asTagArray(v: unknown): string[] {
  return Array.isArray(v) ? normalizeTags(v as string[]) : [];
}

/**
 * 从任务 result 读回 changeset 行。
 * 写回入口据此校验：缺 productId、或声称要改却给不出任何标签变更的行直接丢弃。
 */
export function coerceBulkTagEditRows(raw: unknown): BulkTagEditRow[] {
  if (!Array.isArray(raw)) return [];
  const out: BulkTagEditRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const productId = asString(r.productId).trim();
    if (!productId) continue;

    const skipped = r.skipped === true;
    const addedTags = asTagArray(r.addedTags);
    const removedTags = asTagArray(r.removedTags);
    if (!skipped && addedTags.length === 0 && removedTags.length === 0) continue;

    const skipReason = asString(r.skipReason).trim();
    out.push({
      productId,
      productTitle: asString(r.productTitle),
      beforeTags: asTagArray(r.beforeTags),
      afterTags: asTagArray(r.afterTags),
      addedTags,
      removedTags,
      skipped,
      ...(skipReason ? { skipReason: skipReason as BulkTagEditSkipReason } : {}),
    });
  }
  return out;
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

/** 标签列表在 CSV 单元格里用 `, ` 连接；escapeCsvCell 会负责加引号。 */
function joinTags(tags: string[]): string {
  return tags.join(", ");
}

const CHANGESET_CSV_HEADERS = [
  "product_title",
  "product_id",
  "before_tags",
  "after_tags",
  "added_tags",
  "removed_tags",
  "action",
  "reason",
] as const;

/** 验收用的变更清单（含被跳过的行与原因），也是人工比对的底稿。 */
export function buildBulkTagEditChangesetCsv(rows: BulkTagEditRow[]): string {
  return toCsv(
    CHANGESET_CSV_HEADERS,
    rows.map((row) => [
      row.productTitle,
      row.productId,
      joinTags(row.beforeTags),
      row.skipped ? "" : joinTags(row.afterTags),
      row.skipped ? "" : joinTags(row.addedTags),
      row.skipped ? "" : joinTags(row.removedTags),
      row.skipped ? "skip" : "change",
      row.skipped ? (row.skipReason ?? "") : "",
    ]),
  );
}

const ROLLBACK_CSV_HEADERS = [
  "product_id",
  "product_title",
  "rollback_add_tags",
  "rollback_remove_tags",
] as const;

/**
 * 回滚清单：标签是增量操作，撤销就是把加的减回去、把减的加回来。
 * 只列真正会写入的行。
 */
export function buildBulkTagEditRollbackCsv(rows: BulkTagEditRow[]): string {
  return toCsv(
    ROLLBACK_CSV_HEADERS,
    rows
      .filter((row) => !row.skipped)
      .map((row) => [
        row.productId,
        row.productTitle,
        joinTags(row.removedTags),
        joinTags(row.addedTags),
      ]),
  );
}
