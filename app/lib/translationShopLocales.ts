import type {
  ShopLocaleOption,
  ShopLocalesPayload,
} from "./productImproveLocales";

export type TranslationLocalesResolved = {
  /** 店铺主语言（primary），用作翻译源语言 */
  sourceLocale: string;
  sourceLabel: string;
  /** 可选目标语言（已排除源语言，含 published / 未 published） */
  targetOptions: ShopLocaleOption[];
};

/** 去掉翻译 UI 展示用的 locale 简写后缀，如 `English (en)` → `English`。 */
export function formatTranslationLocaleLabel(label: string): string {
  const trimmed = label.trim();
  return trimmed.replace(/\s*\([a-z]{2}(?:-[A-Za-z0-9]+)?\)\s*$/, "").trim() || trimmed;
}

/** 映射选项 label 为翻译域展示文案，保留 value 不变。 */
export function toTranslationLocaleOptions(
  options: ShopLocaleOption[],
): ShopLocaleOption[] {
  return options.map((o) => ({
    ...o,
    label: formatTranslationLocaleLabel(o.label),
  }));
}

function labelForLocale(locale: string, options: ShopLocaleOption[]): string {
  const match = options.find((o) => o.value === locale);
  return formatTranslationLocaleLabel(match?.label ?? locale);
}

function filterTargetOptions(
  options: ShopLocaleOption[],
  sourceLocale: string,
): ShopLocaleOption[] {
  return options.filter((o) => o.value !== sourceLocale);
}

/**
 * 将 {@link ShopLocalesPayload} 解析为翻译表单用的源/目标语言选项。
 * `defaultTargetLanguage` 在 payload 中表示店铺 primary locale，此处作为 source。
 */
export function resolveTranslationLocales(
  payload: ShopLocalesPayload,
): TranslationLocalesResolved {
  const sourceLocale = payload.defaultTargetLanguage.trim();
  const sourceLabel = labelForLocale(sourceLocale, payload.localeOptions);
  const targetOptions = toTranslationLocaleOptions(
    filterTargetOptions(payload.localeOptions, sourceLocale),
  );

  return {
    sourceLocale,
    sourceLabel,
    targetOptions,
  };
}

/** 从目标选项中解析默认选中值：优先 initial，否则第一项。 */
export function resolveDefaultTargetLocale(
  targetOptions: ShopLocaleOption[],
  initialTargetLocale?: string,
): string {
  const initial = initialTargetLocale?.trim();
  if (initial && targetOptions.some((o) => o.value === initial)) {
    return initial;
  }
  return targetOptions[0]?.value ?? "";
}

/** 多选初始值：优先 initialTargetLocales，否则单值 initialTargetLocale，否则默认第一项。 */
export function resolveInitialTargetLocales(
  targetOptions: ShopLocaleOption[],
  initialTargetLocale?: string,
  initialTargetLocales?: string[],
): string[] {
  const allowed = new Set(targetOptions.map((o) => o.value));
  const fromList = (initialTargetLocales ?? [])
    .map((x) => x.trim())
    .filter((x) => allowed.has(x));
  if (fromList.length) {
    const seen = new Set<string>();
    return fromList.filter((x) => {
      if (seen.has(x)) return false;
      seen.add(x);
      return true;
    });
  }
  const single = resolveDefaultTargetLocale(targetOptions, initialTargetLocale);
  return single ? [single] : [];
}
