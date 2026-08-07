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
