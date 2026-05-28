import type { ShopLocaleOption } from "./productImproveLocales";

function localeKey(value: string): string {
  return value.trim();
}

/**
 * 将输入规范为合法目标语言列表：trim、去重、排除 source、仅保留 targetOptions 内项。
 */
export function normalizeTargetLocales(
  input: string | string[] | undefined,
  targetOptions: ShopLocaleOption[],
  sourceLocale: string,
): string[] {
  const allowed = new Set(targetOptions.map((o) => o.value));
  const source = localeKey(sourceLocale);

  const rawList = Array.isArray(input)
    ? input
    : typeof input === "string" && input.trim()
      ? [input]
      : [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of rawList) {
    const key = localeKey(item);
    if (!key || key === source || !allowed.has(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(key);
  }

  return result;
}

export type ValidateTargetLocalesResult =
  | { ok: true }
  | { ok: false; message: string };

/** 校验至少一个目标语言，且均不等于源语言。 */
export function validateTargetLocales(
  locales: string[],
  sourceLocale: string,
): ValidateTargetLocalesResult {
  const source = localeKey(sourceLocale);
  if (!locales.length) {
    return { ok: false, message: "validationTargetRequired" };
  }
  if (locales.some((l) => localeKey(l) === source)) {
    return { ok: false, message: "validationSameLocale" };
  }
  return { ok: true };
}
