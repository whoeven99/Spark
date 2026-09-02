/**
 * 表格导入的公共底座：行结构、金额解析、列映射校验。
 *
 * 「按表格改店铺数据」现在有多个消费者（价目表导入、成本价导入），
 * 它们的差异在于改哪个字段、走哪个 mutation；把表格读进来这一段是完全一样的。
 * 这里只放与具体业务字段无关的部分，纯函数，浏览器与服务端共用。
 */

/** 单次导入的行数硬上限，与批量能力的对象上限对齐。 */
export const SHEET_IMPORT_MAX_ROWS = 1000;

/**
 * 匹配率低于这个比例时判定为列映射选错，直接让任务失败。
 * 这种情况下让用户去预览里一行行看没有意义。
 */
export const SHEET_IMPORT_MIN_MATCH_RATE = 0.5;

/**
 * 新值与现值相差超过这个倍数时打备注。
 * 主要用于兜住「千分位被当成小数点」这类会放大 1000 倍的解析歧义，
 * 顺带也能抓到手滑多打一个零。
 */
export const SHEET_IMPORT_SUSPICIOUS_RATIO = 50;

export type SheetRow = {
  /** 表格里的行号（1 基，和用户在 Excel 里看到的一致） */
  sourceRow: number;
  cells: Record<string, string>;
};

// ─── 金额规范化 ───────────────────────────────────────────────────────────────

const CURRENCY_NOISE = /[¥￥$€£₩₽]|CNY|USD|EUR|GBP|RMB|元|円|圆/gi;
/** 空格类字符在部分地区当千分位用（法语的窄空格、俄语的不间断空格）。 */
const SPACE_LIKE = /[\s\u00a0\u202f']/g;

/**
 * 千分位分组必须是「首组 1-3 位 + 其余每组正好 3 位」。
 * 不校验的话 `12.34.56.78` 这种垃圾会被拼成 12345678，静默变成一个看似合法的天价。
 */
function isThousandsGrouped(parts: string[]): boolean {
  if (parts.length < 2) return false;
  if (!/^\d{1,3}$/.test(parts[0])) return false;
  return parts.slice(1).every((part) => /^\d{3}$/.test(part));
}

/**
 * 单次出现的分隔符后面正好跟 3 位数字时按千分位处理（`1,299` / `1.299`）。
 * Shopify 金额是两位小数，出现 3 位小数的概率远低于千分位。
 * 判不准的一律返回 null 交给上层报错，不猜。
 */
function normalizeSeparators(input: string): string | null {
  const hasComma = input.includes(",");
  const hasDot = input.includes(".");
  if (!hasComma && !hasDot) return input;

  if (hasComma && hasDot) {
    // 两种都有：靠后的那个是小数点，另一个是千分位
    const decimalSep = input.lastIndexOf(",") > input.lastIndexOf(".") ? "," : ".";
    const thousandSep = decimalSep === "," ? "." : ",";
    const idx = input.lastIndexOf(decimalSep);
    const intPart = input.slice(0, idx);
    const fracPart = input.slice(idx + 1);
    if (fracPart.includes(",") || fracPart.includes(".")) return null;
    const groups = intPart.split(thousandSep);
    if (groups.length > 1 && !isThousandsGrouped(groups)) return null;
    return `${groups.join("")}.${fracPart}`;
  }

  const sep = hasComma ? "," : ".";
  const parts = input.split(sep);
  if (parts.length > 2) {
    return isThousandsGrouped(parts) ? parts.join("") : null;
  }
  const [head, tail] = parts;
  // `0.500` 这种小数打头的不可能是千分位
  if (tail.length === 3 && head !== "0" && /^\d{1,3}$/.test(head)) {
    return parts.join("");
  }
  return `${head}.${tail}`;
}

/**
 * 商户表格里的金额文本 → 分。
 * 处理货币符号、千分位与欧式小数逗号；无法确定地解析出非负金额时返回 null（不猜）。
 */
export function parseImportMoneyToCents(raw: string | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(CURRENCY_NOISE, "").replace(SPACE_LIKE, "").trim();
  if (!cleaned) return null;
  // 负数没有业务含义，宁可报错也不要写进店铺
  if (cleaned.startsWith("-")) return null;

  const normalized = normalizeSeparators(cleaned);
  if (normalized == null || !/^\d+(\.\d+)?$/.test(normalized)) return null;

  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

// ─── 整数数量规范化 ───────────────────────────────────────────────────────────

/** 库存数量的上限：够覆盖任何真实备货量，再大基本是把金额列当库存列选了。 */
export const SHEET_IMPORT_MAX_QUANTITY = 1_000_000;

/**
 * 商户表格里的数量文本 → 非负整数。
 *
 * 与金额解析的区别：库存是件数，不能有小数。Excel 常把整数导出成 `50.0` / `50.00`，
 * 这类纯零小数位按整数接受；`50.5` 这种真小数一律返回 null，
 * 因为四舍五入到 50 还是 51 都是替商户做决定，宁可报错让他改表。
 * 负数同样返回 null——Shopify 允许负库存（超卖后的状态），但从表格导入负数几乎必然是笔误。
 */
export function parseImportQuantity(raw: string | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(SPACE_LIKE, "").trim();
  if (!cleaned) return null;
  if (cleaned.startsWith("-")) return null;

  const normalized = normalizeSeparators(cleaned);
  if (normalized == null || !/^\d+(\.\d+)?$/.test(normalized)) return null;

  const [intPart, fracPart] = normalized.split(".");
  if (fracPart && /[1-9]/.test(fracPart)) return null;

  const value = Number(intPart);
  if (!Number.isFinite(value) || value < 0 || value > SHEET_IMPORT_MAX_QUANTITY) return null;
  return value;
}

/** 数量级异常判定：两个非零金额相差达到 `SHEET_IMPORT_SUSPICIOUS_RATIO` 倍。 */
export function isSuspiciousMagnitude(beforeCents: number, afterCents: number): boolean {
  if (beforeCents <= 0 || afterCents <= 0) return false;
  const ratio = afterCents > beforeCents ? afterCents / beforeCents : beforeCents / afterCents;
  return ratio >= SHEET_IMPORT_SUSPICIOUS_RATIO;
}

// ─── SKU ──────────────────────────────────────────────────────────────────────

export function normalizeSku(raw: string): string {
  return raw.trim();
}

/** SKU 在 Shopify 里不区分大小写地比较更贴近商户预期。 */
export function skuKey(sku: string): string {
  return sku.trim().toLowerCase();
}

// ─── 列映射 ───────────────────────────────────────────────────────────────────

export class SheetImportMappingError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SheetImportMappingError";
    this.code = code;
  }
}

/** 映射到的列必须真实存在，否则整表读出来会全是空值。 */
export function validateColumnsAgainstHeaders(columns: string[], headers: string[]): void {
  const known = new Set(headers);
  const missing = columns.filter((column) => column && !known.has(column));
  if (missing.length > 0) {
    throw new SheetImportMappingError(
      "column_not_found",
      `表格里没有这些列：${missing.join("、")}。实际列名是：${headers.join("、")}`,
    );
  }
}
