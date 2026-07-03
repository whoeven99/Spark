/** 店铺语言选项：供生成描述页 / 聊天卡片与 GET `/api/shop-locales` 共用。 */

export type ShopLocaleOption = {
  value: string;
  label: string;
  /** 是否已在 Shopify 店铺中发布；翻译目标语言过滤时使用，生成描述页可忽略。 */
  published?: boolean;
};

export type ShopLocalesPayload = {
  defaultTargetLanguage: string;
  localeOptions: ShopLocaleOption[];
  /**
   * 当 Admin GraphQL `shopLocales` 不可用（缺 scope、网络或返回空列表）时使用静态列表，
   * 避免前端无语言可选；服务端应打日志说明原因。
   */
  isFallback: boolean;
};

/** GraphQL `shopLocales` 单行（与 Admin API 字段对齐）。 */
export type ShopLocaleGraphqlRow = {
  locale: string;
  name: string;
  primary: boolean;
  published: boolean;
};

export const SHOP_LOCALES_FALLBACK: ShopLocalesPayload = {
  defaultTargetLanguage: "en",
  localeOptions: [
    { value: "en", label: "English (en)", published: true },
    { value: "zh-CN", label: "简体中文 (zh-CN)", published: true },
    { value: "zh-TW", label: "繁體中文 (zh-TW)", published: true },
    { value: "ja", label: "日本語 (ja)", published: true },
    { value: "ko", label: "한국어 (ko)", published: true },
    { value: "de", label: "Deutsch (de)", published: true },
    { value: "fr", label: "Français (fr)", published: true },
    { value: "es", label: "Español (es)", published: true },
  ],
  isFallback: true,
};

export type ShopLocalesApiSuccessBody = {
  success: true;
  errorCode: 0;
  errorMsg: "";
  response: ShopLocalesPayload;
};

export type ShopLocalesApiErrorBody = {
  success: false;
  errorCode: number;
  errorMsg: string;
  response: null;
};

export type ShopLocalesApiResponse =
  | ShopLocalesApiSuccessBody
  | ShopLocalesApiErrorBody;

export type ShopLocalesResolved = {
  sourceLocale: string;
  sourceLabel: string;
  targetOptions: ShopLocaleOption[];
};

export function formatShopLocaleLabel(label: string): string {
  const trimmed = label.trim();
  return trimmed.replace(/\s*\([a-z]{2}(?:-[A-Za-z0-9]+)?\)\s*$/, "").trim() || trimmed;
}

export function toShopLocaleOptions(options: ShopLocaleOption[]): ShopLocaleOption[] {
  return options.map((o) => ({
    ...o,
    label: formatShopLocaleLabel(o.label),
  }));
}

function labelForLocale(locale: string, options: ShopLocaleOption[]): string {
  const match = options.find((o) => o.value === locale);
  return formatShopLocaleLabel(match?.label ?? locale);
}

function filterTargetOptions(
  options: ShopLocaleOption[],
  sourceLocale: string,
): ShopLocaleOption[] {
  return options.filter((o) => o.value !== sourceLocale);
}

export function resolveShopLocales(payload: ShopLocalesPayload): ShopLocalesResolved {
  const sourceLocale = payload.defaultTargetLanguage.trim();
  const sourceLabel = labelForLocale(sourceLocale, payload.localeOptions);
  const targetOptions = toShopLocaleOptions(
    filterTargetOptions(payload.localeOptions, sourceLocale),
  );

  return {
    sourceLocale,
    sourceLabel,
    targetOptions,
  };
}

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
