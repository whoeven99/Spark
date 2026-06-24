/**
 * Shopify 字段长度约束（写回 translationsRegister 硬限制）。
 * Product/COLLECTION/PAGE/ARTICLE/BLOG 等资源的 `title` 字段上限为 255 字符。
 */
export const SHOPIFY_TITLE_MAX_CHARS = 255;

export function isTitleFieldKey(key: string): boolean {
  return key.trim().toLowerCase() === "title";
}

/**
 * 将 title 译文截断到 Shopify 可接受长度。
 * 优先在靠后的空格处截断，避免硬切单词中间。
 */
export function clampTitleFieldValue(
  value: string,
  maxChars = SHOPIFY_TITLE_MAX_CHARS,
): string {
  if (value.length <= maxChars) return value;
  const slice = value.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > maxChars - 40 && lastSpace > 0) {
    return slice.slice(0, lastSpace).trimEnd();
  }
  return slice;
}

/** 按字段 key 应用长度约束（当前仅 title）。 */
export function enforceFieldTranslationLimits(key: string, value: string): string {
  if (!isTitleFieldKey(key)) return value;
  return clampTitleFieldValue(value);
}

export type LimitedTranslateResult = {
  key: string;
  translatedValue: string;
  digest: string;
  status: "translated" | "fallback";
};

export function enforceTranslateResultLimits<T extends LimitedTranslateResult>(result: T): T {
  const clamped = enforceFieldTranslationLimits(result.key, result.translatedValue);
  if (clamped === result.translatedValue) return result;
  return { ...result, translatedValue: clamped };
}
