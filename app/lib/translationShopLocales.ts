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

function labelForLocale(
  locale: string,
  options: ShopLocaleOption[],
): string {
  const match = options.find((o) => o.value === locale);
  return match?.label ?? locale;
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
  const targetOptions = filterTargetOptions(
    payload.localeOptions,
    sourceLocale,
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
