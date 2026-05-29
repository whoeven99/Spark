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
