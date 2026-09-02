/**
 * 商品 Metafield 批量改写 — 值渲染、类型校验、变更试算与 CSV（纯函数，浏览器与服务端共用）。
 *
 * 与其它批量能力的分工：调价/打标/上下架/合集改的都是 Shopify 内置字段，
 * 这里改的是**商户自己定义的结构化字段**。差别体现在三处：
 *   - 目标字段不是写死的，而是商户在 Shopify 后台建的 MetafieldDefinition，
 *     值的合法性由定义的 `type` 决定，因此类型校验是本能力的主要复杂度。
 *   - 「清空」和「设值」是两个不同的 Shopify mutation，不是同一个操作传空串。
 *   - 字段标识用 `namespace.key` 而不是 GID：Shopify 在 2026-07 已经把
 *     `metafieldDefinition(id:)` 标记为 deprecated，改推 `identifier: {ownerType, namespace, key}`，
 *     而且 `namespace.key` 在 CSV 和日志里是人能看懂的。
 *
 * 几条定死的语义（改动前先回头看）：
 *   - **只处理有定义的 Product metafield**。没有定义的临时字段读不到类型，
 *     写进去等于凭空造 schema，不在本能力范围。
 *   - **动作没有默认值**。设值和清空方向相反，猜错等于把商户填好的字段全抹掉。
 *   - **值支持占位符**（`{title}` / `{vendor}` / `{productType}`），渲染是确定性的，
 *     不调模型、零 token。不含占位符时就是字面量。
 *   - **类型不合法就不写**，不四舍五入、不截断、不猜布尔值语义之外的写法。
 *   - 清空只对「当前确实有值」的行发 delete，本来就没值的行标 `nothing_to_clear`。
 *
 * 本文件不接触 Shopify、不做任何写入；定义信息与商品当前值由调用方读好后传进来。
 */
import { toCsv } from "./csv";

/** 单次任务的规模硬上限（超过则拒绝创建，避免限流与超时）。 */
export const BULK_METAFIELD_EDIT_MAX_PRODUCTS = 200;

/** 值模板长度上限：multi_line 可以很长，这里只挡明显的误粘贴。 */
export const BULK_METAFIELD_VALUE_MAX_LENGTH = 5000;

/** 值模板里允许的占位符，与批量 SEO 保持一致。 */
export const BULK_METAFIELD_EDIT_PLACEHOLDERS = ["title", "vendor", "productType"] as const;

export type BulkMetafieldEditPlaceholder = (typeof BULK_METAFIELD_EDIT_PLACEHOLDERS)[number];

/**
 * 本能力支持的 metafield 类型。
 *
 * 刻意只收「一个字符串就能表达、且能在试算期校验」的标量类型：
 * `list.*` 要 JSON 数组、`*_reference` 要 GID、`rich_text_field` 要特定 JSON 结构，
 * 商户在一个输入框里几乎不可能填对，报错也解释不清楚。
 * 以后要扩类型，先想清楚卡片上怎么让商户填对，再往这里加。
 */
export const BULK_METAFIELD_EDIT_SUPPORTED_TYPES = [
  "single_line_text_field",
  "multi_line_text_field",
  "number_integer",
  "number_decimal",
  "boolean",
  "url",
] as const;

export type BulkMetafieldEditSupportedType =
  (typeof BULK_METAFIELD_EDIT_SUPPORTED_TYPES)[number];

export function isSupportedMetafieldType(type: string): type is BulkMetafieldEditSupportedType {
  return (BULK_METAFIELD_EDIT_SUPPORTED_TYPES as readonly string[]).includes(type);
}

/** 设值 / 清空。两者走不同的 Shopify mutation，不是「设成空串」。 */
export type BulkMetafieldEditAction = "set" | "clear";

/** 卡片参数解析结果。此时还不知道字段类型，类型校验要等读到定义。 */
export type BulkMetafieldEditRule = {
  action: BulkMetafieldEditAction;
  namespace: string;
  key: string;
  /** action === "clear" 时为 null */
  valueTemplate: string | null;
  /** 只填当前为空的，不覆盖商户已经写过的值；clear 时无意义 */
  onlyFillEmpty: boolean;
};

/** 从 Shopify 读到的定义（权威值，卡片里的旧标题一律不用）。 */
export type BulkMetafieldEditDefinition = {
  definitionId: string;
  name: string;
  namespace: string;
  key: string;
  type: string;
  description: string | null;
};

/**
 * 规则 + 定义 → 可执行计划。
 * 到这一步类型已知，字面值的合法性也已校验过，逐行计算不会再因为「值不合类型」整批失败。
 */
export type BulkMetafieldEditPlan = {
  action: BulkMetafieldEditAction;
  name: string;
  namespace: string;
  key: string;
  type: BulkMetafieldEditSupportedType;
  valueTemplate: string | null;
  onlyFillEmpty: boolean;
  /**
   * 模板不含占位符时预先规范化好的字面值；含占位符时为 null，逐行渲染后再校验。
   */
  staticValue: string | null;
};

export type BulkMetafieldEditSkipReason =
  /** 目标值与当前值相同 */
  | "no_change"
  /** 选了「只填当前为空的」，但这个商品已经有值 */
  | "already_filled"
  /** 占位符取值全为空，渲染结果是空串 */
  | "empty_result"
  /** 要清空，但这个商品本来就没有这个字段 */
  | "nothing_to_clear"
  /** 渲染结果不符合字段类型 */
  | "invalid_value";

export type BulkMetafieldEditProductInput = {
  productId: string;
  productTitle: string;
  vendor: string | null;
  productType: string | null;
  /** 该商品当前这个 metafield 的值；null 表示没设过 */
  currentValue: string | null;
};

export type BulkMetafieldEditRow = {
  productId: string;
  productTitle: string;
  beforeValue: string | null;
  /** clear 或跳过时为 null */
  afterValue: string | null;
  skipped: boolean;
  skipReason?: BulkMetafieldEditSkipReason;
  /** skipReason === "invalid_value" 时的渲染结果，方便商户回去改模板 */
  invalidValue?: string;
};

export type BulkMetafieldEditSummary = {
  products: number;
  changed: number;
  skipped: number;
  /** 会写入值的行数 */
  setCount: number;
  /** 会清空的行数 */
  clearCount: number;
  /** 值不合类型而被跳过的行数，审核页要单独提示 */
  invalidCount: number;
};

export type BulkMetafieldEditApplyOutcome = {
  at: string;
  succeeded: number;
  failed: number;
  errors: Array<{ productId: string; message: string }>;
};

// ─── 字段标识 ─────────────────────────────────────────────────────────────────

/**
 * `namespace.key` ↔ 两段式标识。
 *
 * 按**最后一个点**切：key 只允许字母数字/连字符/下划线（不含点），
 * 而 namespace 理论上可以更宽松，所以从右边切才不会把带点的 namespace 拆坏。
 */
export function parseMetafieldFieldKey(raw: string): { namespace: string; key: string } | null {
  const trimmed = raw.trim();
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === trimmed.length - 1) return null;
  const namespace = trimmed.slice(0, lastDot);
  const key = trimmed.slice(lastDot + 1);
  if (!namespace || !key) return null;
  return { namespace, key };
}

export function formatMetafieldFieldKey(namespace: string, key: string): string {
  return `${namespace}.${key}`;
}

// ─── 类型校验 ─────────────────────────────────────────────────────────────────

const INTEGER_PATTERN = /^-?\d+$/;
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

/** 商户可能写的各种「真」「假」。Shopify 只认 "true" / "false"，这里统一收敛。 */
const TRUE_WORDS = new Set(["true", "1", "yes", "y", "是"]);
const FALSE_WORDS = new Set(["false", "0", "no", "n", "否"]);

/**
 * 把渲染结果规范化成 Shopify 能接受的值；不合类型返回 null。
 *
 * 只做「同一个意思的不同写法」的收敛（如 `Yes` → `true`），
 * 不做任何有损转换：`3.5` 不会被四舍五入成 `4` 塞进 number_integer，
 * 因为进位方向是商户的决定，不是我们的。
 */
export function normalizeMetafieldValue(
  type: BulkMetafieldEditSupportedType,
  raw: string,
): string | null {
  const value = raw.trim();
  if (!value) return null;

  switch (type) {
    case "single_line_text_field":
      // 单行字段塞进换行会被 Shopify 拒；与其让写回失败，不如在试算就标出来
      return /[\r\n]/.test(value) ? null : value;
    case "multi_line_text_field":
      return value;
    case "number_integer":
      // BigInt 顺带把 `007` / `+5` 这类写法规范化，同时不会像 Number 那样丢精度
      return INTEGER_PATTERN.test(value) ? String(BigInt(value)) : null;
    case "number_decimal":
      return DECIMAL_PATTERN.test(value) ? value : null;
    case "boolean": {
      const lower = value.toLowerCase();
      if (TRUE_WORDS.has(lower)) return "true";
      if (FALSE_WORDS.has(lower)) return "false";
      return null;
    }
    case "url": {
      // 只放行 http(s)：Shopify 的 url 类型不接受 mailto / javascript 之类
      try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:" ? value : null;
      } catch {
        return null;
      }
    }
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}

// ─── 值渲染 ───────────────────────────────────────────────────────────────────

const PLACEHOLDER_PATTERN = /\{\s*([a-zA-Z_]+)\s*\}/g;

function normalizeField(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 渲染值模板。
 *
 * 与 SEO 模板渲染的区别：这里**不做分隔符清理**。
 * metafield 存的是结构化数据，商户写什么就该写进去什么，
 * 擅自压缩空白或删掉尾部标点会改变语义。
 */
export function renderMetafieldTemplate(
  template: string,
  product: Pick<BulkMetafieldEditProductInput, "productTitle" | "vendor" | "productType">,
): string {
  const values: Record<BulkMetafieldEditPlaceholder, string> = {
    title: normalizeField(product.productTitle),
    vendor: normalizeField(product.vendor),
    productType: normalizeField(product.productType),
  };
  return template.replace(PLACEHOLDER_PATTERN, (_match, name: string) => {
    const key = name.trim() as BulkMetafieldEditPlaceholder;
    return values[key] ?? "";
  });
}

export function templateHasPlaceholder(template: string): boolean {
  // 全局正则带 lastIndex 状态，复用前必须归零，否则第二次调用会从上次位置继续找
  PLACEHOLDER_PATTERN.lastIndex = 0;
  return PLACEHOLDER_PATTERN.test(template);
}

// ─── 规则解析 ─────────────────────────────────────────────────────────────────

export class BulkMetafieldEditRuleError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BulkMetafieldEditRuleError";
    this.code = code;
  }
}

function parseAction(raw: string | undefined): BulkMetafieldEditAction {
  const value = (raw ?? "").trim();
  if (value === "set" || value === "clear") return value;
  // 设值与清空方向相反，猜错等于把商户填好的字段抹掉，因此没有默认值
  throw new BulkMetafieldEditRuleError(
    "missing_action",
    "请先选择要「设置为指定值」还是「清空该字段」",
  );
}

/**
 * TaskProposal 参数（全是字符串）→ 规则。
 * 非法输入抛 BulkMetafieldEditRuleError，由调用方转成用户可读的错误，不做静默兜底。
 */
export function parseBulkMetafieldEditRule(
  params: Record<string, string>,
): BulkMetafieldEditRule {
  const action = parseAction(params.metafieldAction);

  const rawField = (params.fieldKey ?? "").trim();
  if (!rawField) {
    throw new BulkMetafieldEditRuleError("missing_definition", "请先选择要修改的自定义字段");
  }
  const field = parseMetafieldFieldKey(rawField);
  if (!field) {
    throw new BulkMetafieldEditRuleError(
      "invalid_definition",
      "字段标识无效，请重新选择自定义字段",
    );
  }

  if (action === "clear") {
    return { action, ...field, valueTemplate: null, onlyFillEmpty: false };
  }

  const valueTemplate = params.value ?? "";
  if (!valueTemplate.trim()) {
    throw new BulkMetafieldEditRuleError(
      "missing_value",
      "请填写要写入的值，或改选「清空该字段」",
    );
  }
  if (valueTemplate.length > BULK_METAFIELD_VALUE_MAX_LENGTH) {
    throw new BulkMetafieldEditRuleError(
      "value_too_long",
      `值超过 ${BULK_METAFIELD_VALUE_MAX_LENGTH} 个字符`,
    );
  }
  for (const match of valueTemplate.matchAll(PLACEHOLDER_PATTERN)) {
    const name = match[1].trim();
    if (!BULK_METAFIELD_EDIT_PLACEHOLDERS.includes(name as BulkMetafieldEditPlaceholder)) {
      throw new BulkMetafieldEditRuleError(
        "unknown_placeholder",
        `值里的 {${name}} 不是可用占位符，可用的有：${BULK_METAFIELD_EDIT_PLACEHOLDERS.map((p) => `{${p}}`).join("、")}`,
      );
    }
  }

  return {
    action,
    ...field,
    valueTemplate,
    onlyFillEmpty: params.onlyFillEmpty === "true",
  };
}

/** 给服务端错误文案用的类型说明。UI 侧另有 i18n 版本。 */
export function describeMetafieldType(type: BulkMetafieldEditSupportedType): string {
  switch (type) {
    case "single_line_text_field":
      return "单行文本";
    case "multi_line_text_field":
      return "多行文本";
    case "number_integer":
      return "整数";
    case "number_decimal":
      return "小数";
    case "boolean":
      return "是 / 否值";
    case "url":
      return "网址（需以 http:// 或 https:// 开头）";
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}

/**
 * 规则 + 定义 → 计划。类型不受支持、或字面值不合类型时抛错，让整个任务失败。
 *
 * 为什么字面值不合类型要整任务失败、而不是逐行标跳过：
 * 值是全店统一的，不合类型就是每一行都不合，产出一屏「跳过」没有任何信息量，
 * 不如直接告诉商户「`abc` 不是整数」让他改了重来。
 * 含占位符的模板不同 —— 渲染结果逐个商品不一样，那种才逐行标注。
 */
export function resolveBulkMetafieldEditPlan(
  rule: BulkMetafieldEditRule,
  definition: BulkMetafieldEditDefinition,
): BulkMetafieldEditPlan {
  if (!isSupportedMetafieldType(definition.type)) {
    throw new BulkMetafieldEditRuleError(
      "unsupported_type",
      `字段「${definition.name}」的类型是 ${definition.type}，本功能暂不支持批量修改这种类型`,
    );
  }

  const base = {
    action: rule.action,
    name: definition.name,
    namespace: definition.namespace,
    key: definition.key,
    type: definition.type,
    onlyFillEmpty: rule.onlyFillEmpty,
  };

  if (rule.action === "clear" || rule.valueTemplate == null) {
    return { ...base, valueTemplate: null, staticValue: null };
  }

  if (templateHasPlaceholder(rule.valueTemplate)) {
    return { ...base, valueTemplate: rule.valueTemplate, staticValue: null };
  }

  const staticValue = normalizeMetafieldValue(definition.type, rule.valueTemplate);
  if (staticValue == null) {
    throw new BulkMetafieldEditRuleError(
      "invalid_value",
      `「${rule.valueTemplate.trim()}」不是合法的${describeMetafieldType(definition.type)}，请修改后重试`,
    );
  }
  return { ...base, valueTemplate: rule.valueTemplate, staticValue };
}

// ─── 变更计算 ─────────────────────────────────────────────────────────────────

/** 单个商品的目标值计算。纯函数，无 IO，可单测。 */
export function computeProductMetafieldChange(
  product: BulkMetafieldEditProductInput,
  plan: BulkMetafieldEditPlan,
): BulkMetafieldEditRow {
  const before = product.currentValue;
  const base: BulkMetafieldEditRow = {
    productId: product.productId,
    productTitle: product.productTitle,
    beforeValue: before,
    afterValue: null,
    skipped: false,
  };
  const skip = (
    skipReason: BulkMetafieldEditSkipReason,
    extra?: Partial<BulkMetafieldEditRow>,
  ): BulkMetafieldEditRow => ({ ...base, skipped: true, skipReason, ...extra });

  if (plan.action === "clear") {
    // 本来就没值，发 delete 只是白白消耗一次调用
    return before == null ? skip("nothing_to_clear") : base;
  }

  if (plan.onlyFillEmpty && before != null && before.trim() !== "") {
    return skip("already_filled");
  }

  const rendered =
    plan.staticValue ??
    (plan.valueTemplate == null ? "" : renderMetafieldTemplate(plan.valueTemplate, product));
  if (rendered.trim() === "") {
    // 占位符取值全为空时会走到这里；写空串等于把字段设成空，不是商户的本意
    return skip("empty_result");
  }

  const normalized = plan.staticValue ?? normalizeMetafieldValue(plan.type, rendered);
  if (normalized == null) {
    return skip("invalid_value", { invalidValue: rendered });
  }
  if (normalized === before) {
    return skip("no_change");
  }

  return { ...base, afterValue: normalized };
}

export function buildBulkMetafieldEditSummary(
  rows: BulkMetafieldEditRow[],
  action: BulkMetafieldEditAction,
): BulkMetafieldEditSummary {
  let changed = 0;
  let skipped = 0;
  let invalidCount = 0;
  for (const row of rows) {
    if (row.skipped) {
      skipped += 1;
      if (row.skipReason === "invalid_value") invalidCount += 1;
      continue;
    }
    changed += 1;
  }
  return {
    products: rows.length,
    changed,
    skipped,
    setCount: action === "set" ? changed : 0,
    clearCount: action === "clear" ? changed : 0,
    invalidCount,
  };
}

// ─── 反序列化 ─────────────────────────────────────────────────────────────────

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asNullableString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

const SKIP_REASONS = new Set<string>([
  "no_change",
  "already_filled",
  "empty_result",
  "nothing_to_clear",
  "invalid_value",
]);

/**
 * 从任务 result 读回 changeset 行。
 * 写回入口只信这里产出的结构：缺 productId 的行一律丢弃。
 */
export function coerceBulkMetafieldEditRows(raw: unknown): BulkMetafieldEditRow[] {
  if (!Array.isArray(raw)) return [];
  const out: BulkMetafieldEditRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const productId = asString(r.productId).trim();
    if (!productId) continue;

    const skipped = r.skipped === true;
    const skipReason = asString(r.skipReason).trim();

    out.push({
      productId,
      productTitle: asString(r.productTitle),
      beforeValue: asNullableString(r.beforeValue),
      afterValue: asNullableString(r.afterValue),
      skipped,
      ...(skipped && SKIP_REASONS.has(skipReason)
        ? { skipReason: skipReason as BulkMetafieldEditSkipReason }
        : {}),
      ...(asString(r.invalidValue) ? { invalidValue: asString(r.invalidValue) } : {}),
    });
  }
  return out;
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

type CsvField = { namespace: string; key: string; type: string };

const CHANGESET_CSV_HEADERS = [
  "product_title",
  "product_id",
  "namespace",
  "key",
  "type",
  "before_value",
  "after_value",
  "action",
  "reason",
] as const;

/** 验收用的变更清单（含被跳过的行与原因），也是人工比对的底稿。 */
export function buildBulkMetafieldEditChangesetCsv(
  rows: BulkMetafieldEditRow[],
  field: CsvField,
  action: BulkMetafieldEditAction,
): string {
  return toCsv(
    CHANGESET_CSV_HEADERS,
    rows.map((row) => [
      row.productTitle,
      row.productId,
      field.namespace,
      field.key,
      field.type,
      row.beforeValue ?? "",
      row.skipped ? "" : (row.afterValue ?? ""),
      row.skipped ? "skip" : action,
      row.skipped ? (row.skipReason ?? "") : "",
    ]),
  );
}

const ROLLBACK_CSV_HEADERS = [
  "product_id",
  "product_title",
  "namespace",
  "key",
  "type",
  "rollback_action",
  "rollback_value",
] as const;

/**
 * 回滚清单：只列真正会写入的行，记下写回前的原值。
 *
 * `rollback_action` 这一列不能省 —— 原本就没有这个字段的商品，回滚要**删掉**它，
 * 而不是写一个空串；只给 value 一列的话这两种情况长得一模一样。
 */
export function buildBulkMetafieldEditRollbackCsv(
  rows: BulkMetafieldEditRow[],
  field: CsvField,
): string {
  return toCsv(
    ROLLBACK_CSV_HEADERS,
    rows
      .filter((row) => !row.skipped)
      .map((row) => [
        row.productId,
        row.productTitle,
        field.namespace,
        field.key,
        field.type,
        row.beforeValue == null ? "delete" : "set",
        row.beforeValue ?? "",
      ]),
  );
}
