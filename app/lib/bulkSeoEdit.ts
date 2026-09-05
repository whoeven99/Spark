/**
 * 商品 SEO 批量改写 — 模板渲染、变更计算与 CSV 导出（纯函数，浏览器与服务端共用）。
 *
 * 边界：只负责「给定商品字段 + 模板 → 算出目标 SEO 标题/描述」，不接触 Shopify、不做任何写入。
 * dry-run 任务用它生成 changeset，审核弹窗用同一份数据渲染表格并导出 CSV，
 * 写回执行器只消费 changeset 里已确认的行。
 *
 * 与「商品文案优化」的分工：那边是 AI 逐商品生成正文描述，这里是按确定性模板批量改
 * 搜索引擎元数据，不调模型、不耗 token。
 */
import { toCsv } from "./csv";

/** 单次任务的规模硬上限（超过则拒绝创建，避免限流与超时）。 */
export const BULK_SEO_EDIT_MAX_PRODUCTS = 200;

/** Google 检索结果的常见截断位；超出不会报错，但展示会被截。 */
export const BULK_SEO_TITLE_MAX_LENGTH = 60;
export const BULK_SEO_DESCRIPTION_MAX_LENGTH = 160;

/** 模板里允许的占位符。写错的占位符会被当成字面量写进 SEO，所以解析期就要拦。 */
export const BULK_SEO_EDIT_PLACEHOLDERS = ["title", "vendor", "productType"] as const;

export type BulkSeoEditPlaceholder = (typeof BULK_SEO_EDIT_PLACEHOLDERS)[number];

/** 渲染结果超长时的处理方式。 */
export type BulkSeoEditOverflow = "truncate" | "skip";

export type BulkSeoEditRule = {
  /** null 表示不改这个字段 */
  titleTemplate: string | null;
  descriptionTemplate: string | null;
  /** 只填当前为空的字段，不覆盖商户已经写过的 SEO */
  onlyFillEmpty: boolean;
  overflow: BulkSeoEditOverflow;
};

export type BulkSeoEditSkipReason = "no_change" | "already_filled" | "empty_result";

export type BulkSeoEditNote =
  | "title_truncated"
  | "description_truncated"
  | "title_too_long"
  | "description_too_long";

export type BulkSeoEditProductInput = {
  productId: string;
  productTitle: string;
  vendor: string | null;
  productType: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

export type BulkSeoEditRow = {
  productId: string;
  productTitle: string;
  beforeSeoTitle: string | null;
  afterSeoTitle: string | null;
  beforeSeoDescription: string | null;
  afterSeoDescription: string | null;
  titleChanged: boolean;
  descriptionChanged: boolean;
  skipped: boolean;
  skipReason?: BulkSeoEditSkipReason;
  notes?: BulkSeoEditNote[];
};

export type BulkSeoEditSummary = {
  products: number;
  changed: number;
  skipped: number;
  /** 会写入的字段数（标题 + 描述分别计数） */
  titleChanges: number;
  descriptionChanges: number;
};

export type BulkSeoEditApplyOutcome = {
  at: string;
  succeeded: number;
  failed: number;
  errors: Array<{ productId: string; message: string }>;
};

// ─── 模板渲染 ─────────────────────────────────────────────────────────────────

const PLACEHOLDER_PATTERN = /\{\s*([a-zA-Z_]+)\s*\}/g;

function normalizeField(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

const SEPARATOR_CLASS = "-–—|·,;/";
const TRAILING_SEPARATORS = new RegExp(`[\\s${SEPARATOR_CLASS}]+$`);
const LEADING_SEPARATORS = new RegExp(`^[\\s${SEPARATOR_CLASS}]+`);
const REPEATED_SEPARATORS = new RegExp(`(\\s*[${SEPARATOR_CLASS}]\\s*){2,}`, "g");

/**
 * 占位符取值为空时会留下孤立的分隔符（如 `标题 -  | 店名`）。
 * 这里把重复空白压平，并清掉首尾以及连续出现的分隔符，避免把脏字符串写进 SEO。
 */
function tidySeparators(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    // 连续分隔符只保留第一个，并补回两侧空格
    .replace(REPEATED_SEPARATORS, (match) => ` ${match.trim().charAt(0)} `)
    .replace(LEADING_SEPARATORS, "")
    .replace(TRAILING_SEPARATORS, "")
    .trim();
}

/** 截断后残留的尾部空白与分隔符（如 `品牌 -`）要清掉。 */
function trimTail(value: string): string {
  return value.replace(TRAILING_SEPARATORS, "").trim();
}

/**
 * 截断时若切在词中间（如 `Wireless Ear`），退回到上一个词边界，
 * 但只在退回后仍保留大部分长度时才这么做 —— 否则中日韩这类无空格文本会被砍到几乎为空。
 */
const WORD_BOUNDARY_MIN_RATIO = 0.6;

/** 渲染模板。未知占位符在 parse 阶段已拦下，这里只做替换与清理。 */
export function renderSeoTemplate(
  template: string,
  product: BulkSeoEditProductInput,
): string {
  const values: Record<BulkSeoEditPlaceholder, string> = {
    title: normalizeField(product.productTitle),
    vendor: normalizeField(product.vendor),
    productType: normalizeField(product.productType),
  };
  const replaced = template.replace(PLACEHOLDER_PATTERN, (_match, name: string) => {
    const key = name.trim() as BulkSeoEditPlaceholder;
    return values[key] ?? "";
  });
  return tidySeparators(replaced);
}

/** 截断到上限：优先切在词边界，切不出来才硬截断。 */
export function truncateSeoValue(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const hardCut = value.slice(0, maxLength);
  const cutsMidWord = !/\s/.test(value.charAt(maxLength));
  if (cutsMidWord) {
    const lastSpace = hardCut.lastIndexOf(" ");
    if (lastSpace > 0) {
      const wordCut = trimTail(hardCut.slice(0, lastSpace));
      if (wordCut.length >= Math.floor(maxLength * WORD_BOUNDARY_MIN_RATIO)) return wordCut;
    }
  }
  return trimTail(hardCut);
}

// ─── 规则解析 ─────────────────────────────────────────────────────────────────

export class BulkSeoEditRuleError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BulkSeoEditRuleError";
    this.code = code;
  }
}

/** 模板长度上限：渲染后还会截断，这里只挡明显的误粘贴。 */
const MAX_TEMPLATE_LENGTH = 500;

function parseTemplate(raw: string | undefined, field: string): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_TEMPLATE_LENGTH) {
    throw new BulkSeoEditRuleError(
      "template_too_long",
      `${field}模板超过 ${MAX_TEMPLATE_LENGTH} 个字符`,
    );
  }
  for (const match of trimmed.matchAll(PLACEHOLDER_PATTERN)) {
    const name = match[1].trim();
    if (!BULK_SEO_EDIT_PLACEHOLDERS.includes(name as BulkSeoEditPlaceholder)) {
      throw new BulkSeoEditRuleError(
        "unknown_placeholder",
        `${field}模板里的 {${name}} 不是可用占位符，可用的有：${BULK_SEO_EDIT_PLACEHOLDERS.map((p) => `{${p}}`).join("、")}`,
      );
    }
  }
  return trimmed;
}

function parseBoolean(raw: string | undefined): boolean {
  return raw === "true" || raw === "1" || raw === "yes";
}

/**
 * TaskProposal 参数（全是字符串）→ 规则。
 * 非法输入抛 BulkSeoEditRuleError，由调用方转成用户可读的错误，不做静默兜底。
 */
export function parseBulkSeoEditRule(params: Record<string, string>): BulkSeoEditRule {
  const titleTemplate = parseTemplate(params.titleTemplate, "SEO 标题");
  const descriptionTemplate = parseTemplate(params.descriptionTemplate, "SEO 描述");

  if (!titleTemplate && !descriptionTemplate) {
    throw new BulkSeoEditRuleError(
      "no_op_rule",
      "请至少填写 SEO 标题模板或 SEO 描述模板",
    );
  }

  return {
    titleTemplate,
    descriptionTemplate,
    onlyFillEmpty: parseBoolean(params.onlyFillEmpty),
    overflow: params.overflow === "skip" ? "skip" : "truncate",
  };
}

// ─── 变更计算 ─────────────────────────────────────────────────────────────────

type FieldOutcome = {
  next: string | null;
  changed: boolean;
  blockedByFilled: boolean;
  emptyResult: boolean;
  note?: BulkSeoEditNote;
};

function computeField(args: {
  template: string | null;
  before: string | null;
  product: BulkSeoEditProductInput;
  rule: BulkSeoEditRule;
  maxLength: number;
  truncatedNote: BulkSeoEditNote;
  tooLongNote: BulkSeoEditNote;
}): FieldOutcome {
  const before = normalizeField(args.before);
  const idle: FieldOutcome = {
    next: args.before,
    changed: false,
    blockedByFilled: false,
    emptyResult: false,
  };
  if (!args.template) return idle;
  if (args.rule.onlyFillEmpty && before !== "") {
    return { ...idle, blockedByFilled: true };
  }

  const rendered = renderSeoTemplate(args.template, args.product);
  if (rendered === "") {
    return { ...idle, emptyResult: true };
  }

  let note: BulkSeoEditNote | undefined;
  let next = rendered;
  if (rendered.length > args.maxLength) {
    if (args.rule.overflow === "skip") {
      // 用户选择「超长就不改」：整个字段保持原样，并在预览里说明原因
      return { ...idle, note: args.tooLongNote };
    }
    next = truncateSeoValue(rendered, args.maxLength);
    note = args.truncatedNote;
  }

  return {
    next,
    changed: next !== before,
    blockedByFilled: false,
    emptyResult: false,
    ...(note ? { note } : {}),
  };
}

/** 单个商品的目标 SEO 计算。纯函数，无 IO，可单测。 */
export function computeProductSeoChange(
  product: BulkSeoEditProductInput,
  rule: BulkSeoEditRule,
): BulkSeoEditRow {
  const titleOutcome = computeField({
    template: rule.titleTemplate,
    before: product.seoTitle,
    product,
    rule,
    maxLength: BULK_SEO_TITLE_MAX_LENGTH,
    truncatedNote: "title_truncated",
    tooLongNote: "title_too_long",
  });
  const descriptionOutcome = computeField({
    template: rule.descriptionTemplate,
    before: product.seoDescription,
    product,
    rule,
    maxLength: BULK_SEO_DESCRIPTION_MAX_LENGTH,
    truncatedNote: "description_truncated",
    tooLongNote: "description_too_long",
  });

  const notes = [titleOutcome.note, descriptionOutcome.note].filter(
    (note): note is BulkSeoEditNote => note !== undefined,
  );

  const base: BulkSeoEditRow = {
    productId: product.productId,
    productTitle: product.productTitle,
    beforeSeoTitle: product.seoTitle,
    afterSeoTitle: titleOutcome.changed ? titleOutcome.next : product.seoTitle,
    beforeSeoDescription: product.seoDescription,
    afterSeoDescription: descriptionOutcome.changed
      ? descriptionOutcome.next
      : product.seoDescription,
    titleChanged: titleOutcome.changed,
    descriptionChanged: descriptionOutcome.changed,
    skipped: false,
    ...(notes.length > 0 ? { notes } : {}),
  };

  if (titleOutcome.changed || descriptionOutcome.changed) return base;

  // 没有任何变更时给出最贴切的原因，方便用户判断是模板问题还是本来就不用改
  const requestedFields = [rule.titleTemplate, rule.descriptionTemplate].filter(Boolean).length;
  const blockedCount =
    (titleOutcome.blockedByFilled ? 1 : 0) + (descriptionOutcome.blockedByFilled ? 1 : 0);
  const emptyCount = (titleOutcome.emptyResult ? 1 : 0) + (descriptionOutcome.emptyResult ? 1 : 0);

  const skipReason: BulkSeoEditSkipReason =
    blockedCount === requestedFields && blockedCount > 0
      ? "already_filled"
      : emptyCount === requestedFields && emptyCount > 0
        ? "empty_result"
        : "no_change";

  return { ...base, skipped: true, skipReason };
}

export function buildBulkSeoEditSummary(rows: BulkSeoEditRow[]): BulkSeoEditSummary {
  let changed = 0;
  let skipped = 0;
  let titleChanges = 0;
  let descriptionChanges = 0;
  for (const row of rows) {
    if (row.skipped) {
      skipped += 1;
      continue;
    }
    changed += 1;
    if (row.titleChanged) titleChanges += 1;
    if (row.descriptionChanged) descriptionChanges += 1;
  }
  return { products: rows.length, changed, skipped, titleChanges, descriptionChanges };
}

// ─── 反序列化 ─────────────────────────────────────────────────────────────────

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asNullableString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/**
 * 从任务 result 读回 changeset 行。
 * 写回入口据此校验：缺 productId、或声称要改却给不出目标值的行直接丢弃。
 */
export function coerceBulkSeoEditRows(raw: unknown): BulkSeoEditRow[] {
  if (!Array.isArray(raw)) return [];
  const out: BulkSeoEditRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const productId = asString(r.productId).trim();
    if (!productId) continue;

    const skipped = r.skipped === true;
    const titleChanged = r.titleChanged === true;
    const descriptionChanged = r.descriptionChanged === true;
    if (!skipped && !titleChanged && !descriptionChanged) continue;

    const afterSeoTitle = asNullableString(r.afterSeoTitle);
    const afterSeoDescription = asNullableString(r.afterSeoDescription);
    // 声明要改却没有目标值的行不可信，整行丢弃
    if (titleChanged && !afterSeoTitle?.trim()) continue;
    if (descriptionChanged && !afterSeoDescription?.trim()) continue;

    const skipReason = asString(r.skipReason).trim();
    const notes = Array.isArray(r.notes)
      ? r.notes.filter((n): n is BulkSeoEditNote => typeof n === "string")
      : [];

    out.push({
      productId,
      productTitle: asString(r.productTitle),
      beforeSeoTitle: asNullableString(r.beforeSeoTitle),
      afterSeoTitle,
      beforeSeoDescription: asNullableString(r.beforeSeoDescription),
      afterSeoDescription,
      titleChanged,
      descriptionChanged,
      skipped,
      ...(skipReason ? { skipReason: skipReason as BulkSeoEditSkipReason } : {}),
      ...(notes.length > 0 ? { notes } : {}),
    });
  }
  return out;
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

const CHANGESET_CSV_HEADERS = [
  "product_title",
  "product_id",
  "before_seo_title",
  "after_seo_title",
  "before_seo_description",
  "after_seo_description",
  "action",
  "reason",
  "notes",
] as const;

/** 验收用的变更清单（含被跳过的行与原因），也是人工比对的底稿。 */
export function buildBulkSeoEditChangesetCsv(rows: BulkSeoEditRow[]): string {
  return toCsv(
    CHANGESET_CSV_HEADERS,
    rows.map((row) => [
      row.productTitle,
      row.productId,
      row.beforeSeoTitle ?? "",
      row.titleChanged ? (row.afterSeoTitle ?? "") : "",
      row.beforeSeoDescription ?? "",
      row.descriptionChanged ? (row.afterSeoDescription ?? "") : "",
      row.skipped ? "skip" : "change",
      row.skipped ? (row.skipReason ?? "") : "",
      (row.notes ?? []).join(" "),
    ]),
  );
}

const ROLLBACK_CSV_HEADERS = [
  "product_id",
  "product_title",
  "rollback_seo_title",
  "rollback_seo_description",
] as const;

/** 回滚清单：把写回前的原值记下来，只列真正会写入的行。 */
export function buildBulkSeoEditRollbackCsv(rows: BulkSeoEditRow[]): string {
  return toCsv(
    ROLLBACK_CSV_HEADERS,
    rows
      .filter((row) => !row.skipped)
      .map((row) => [
        row.productId,
        row.productTitle,
        row.titleChanged ? (row.beforeSeoTitle ?? "") : "",
        row.descriptionChanged ? (row.beforeSeoDescription ?? "") : "",
      ]),
  );
}
