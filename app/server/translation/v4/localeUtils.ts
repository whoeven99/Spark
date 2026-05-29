/** 对齐 Spring `normalizeLocaleCode`：trim、`_`→`-`、language 小写、region 大写。 */
export function normalizeTranslationLocale(locale: string | null | undefined): string {
  if (locale == null) return "";
  const cleaned = locale.trim().replace(/_/g, "-");
  if (!cleaned) return "";

  const parts = cleaned.split("-").filter((p) => p.length > 0);
  if (parts.length === 0) return cleaned.toLowerCase();

  const normalized = [parts[0].toLowerCase()];
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (part.length <= 3) {
      normalized.push(part.toUpperCase());
    } else {
      normalized.push(part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
    }
  }
  return normalized.join("-");
}

export function sameTranslationLocale(a: string, b: string): boolean {
  return normalizeTranslationLocale(a) === normalizeTranslationLocale(b);
}
