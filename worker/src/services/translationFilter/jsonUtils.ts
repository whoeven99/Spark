/** Aligns with Spring JsonUtils.isJson — JSON object only (not arrays). */

const HTML_TAG_RE = /<\/?[a-z][^>]*>/i;

export function isHtmlContent(value: string): boolean {
  return HTML_TAG_RE.test(value);
}

export function isJsonObject(value: string): boolean {
  const t = value?.trim();
  if (!t || t[0] !== "{") return false;
  try {
    const parsed = JSON.parse(t) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
  } catch {
    return false;
  }
}
