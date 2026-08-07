export const GOOGLE_REMARKETING_CORE_EVENTS = [
  "page_view",
  "view_item_list",
  "view_search_results",
  "view_item",
  "add_to_cart",
  "view_cart",
  "begin_checkout",
] as const;

export const GOOGLE_REMARKETING_FIELD_GROUPS = [
  "product",
  "transaction",
  "list",
  "legacy_ecomm",
] as const;

export type GoogleRemarketingEvent = (typeof GOOGLE_REMARKETING_CORE_EVENTS)[number];
export type GoogleRemarketingFieldGroup =
  (typeof GOOGLE_REMARKETING_FIELD_GROUPS)[number];

/** 一键启用时使用的推荐事件（全部核心店面事件）。 */
export const GOOGLE_REMARKETING_DEFAULT_EVENTS: GoogleRemarketingEvent[] = [
  ...GOOGLE_REMARKETING_CORE_EVENTS,
];

/** 一键启用时使用的推荐字段组（不含 list / legacy_ecomm）。 */
export const GOOGLE_REMARKETING_DEFAULT_FIELD_GROUPS: GoogleRemarketingFieldGroup[] =
  ["product", "transaction"];

export const GOOGLE_REMARKETING_METAFIELD_KEY = "google_remarketing_config";
export const GOOGLE_REMARKETING_APP_EMBED_HANDLE = "google-remarketing-embed";

export function buildGoogleRemarketingThemeEditorUrl(params: {
  shopDomain: string;
  apiKey: string;
}): string {
  const storeHandle = params.shopDomain.replace(/\.myshopify\.com$/i, "");
  const activateAppId = `${encodeURIComponent(params.apiKey)}/${GOOGLE_REMARKETING_APP_EMBED_HANDLE}`;
  return `https://admin.shopify.com/store/${encodeURIComponent(storeHandle)}/themes/current/editor?context=apps&activateAppId=${activateAppId}`;
}

/** Shopify 客户事件（Custom Pixel）设置页。 */
export function buildShopifyCustomerEventsUrl(shopDomain: string): string {
  const storeHandle = shopDomain.replace(/\.myshopify\.com$/i, "");
  return `https://admin.shopify.com/store/${encodeURIComponent(storeHandle)}/settings/customer_events`;
}

export interface GoogleRemarketingStorefrontConfig {
  tagId: string;
  enabledEvents: GoogleRemarketingEvent[];
  enabledFieldGroups: GoogleRemarketingFieldGroup[];
  /** Google Ads 转化标签（Conversion Label），配合 tagId 组成 send_to。缺省表示只做再营销不发转化。 */
  conversionLabel?: string;
  /** 是否启用 Enhanced Conversions（哈希用户数据），仅作用于 purchase Custom Pixel。 */
  enhancedConversions?: boolean;
}

/**
 * 归一化 Google Ads Conversion ID：
 * - 裸数字 `18326838591` → `AW-18326838591`
 * - `AW-数字`（大小写不敏感）→ 统一大写
 * 无法识别时返回 null。
 */
export function normalizeGoogleConversionId(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return `AW-${raw}`;
  const upper = raw.toUpperCase();
  return /^AW-\d+$/.test(upper) ? upper : null;
}

/** 归一化 Conversion Label：去除首尾空白；空字符串返回空串。 */
export function normalizeGoogleConversionLabel(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim();
}

/** 组装 gtag send_to：`AW-123/label`。缺 label 时退回纯 tagId。 */
export function buildGoogleSendTo(tagId: string, conversionLabel?: string): string {
  const label = (conversionLabel ?? "").trim();
  return label ? `${tagId}/${label}` : tagId;
}

export function normalizeGoogleRemarketingEvents(
  value: unknown,
): GoogleRemarketingEvent[] {
  const allowed = new Set<string>(GOOGLE_REMARKETING_CORE_EVENTS);
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is GoogleRemarketingEvent =>
        typeof item === "string" && allowed.has(item),
      ))]
    : [...GOOGLE_REMARKETING_DEFAULT_EVENTS];
}

export function normalizeGoogleRemarketingFieldGroups(
  value: unknown,
): GoogleRemarketingFieldGroup[] {
  const allowed = new Set<string>(GOOGLE_REMARKETING_FIELD_GROUPS);
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is GoogleRemarketingFieldGroup =>
        typeof item === "string" && allowed.has(item),
      ))]
    : [...GOOGLE_REMARKETING_DEFAULT_FIELD_GROUPS];
}
