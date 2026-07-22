/**
 * TikTok Pixel / Events API 标准事件名与默认勾选配置。
 * UI「Purchase」对应上报名 CompletePayment。
 */

export const TIKTOK_PIXEL_DEFAULT_EVENTS = [
  "ViewContent",
  "AddToCart",
  "InitiateCheckout",
  "CompletePayment",
] as const;

export const TIKTOK_PIXEL_OPTIONAL_EVENTS = [
  "PageView",
  "Search",
  "CollectionView",
  "CartView",
  "AddPaymentInfo",
  "Lead",
] as const;

export const TIKTOK_PIXEL_ALL_EVENTS = [
  ...TIKTOK_PIXEL_DEFAULT_EVENTS,
  ...TIKTOK_PIXEL_OPTIONAL_EVENTS,
] as const;

export type TiktokPixelEventName = (typeof TIKTOK_PIXEL_ALL_EVENTS)[number];

const ALL_SET = new Set<string>(TIKTOK_PIXEL_ALL_EVENTS);

export function isTiktokPixelEventName(value: string): value is TiktokPixelEventName {
  return ALL_SET.has(value);
}

/** 规范化 enabledEvents：去重、过滤非法名；空输入回落默认勾选。 */
export function normalizeTiktokEnabledEvents(input: unknown): TiktokPixelEventName[] {
  if (!Array.isArray(input)) {
    return [...TIKTOK_PIXEL_DEFAULT_EVENTS];
  }
  const seen = new Set<string>();
  const out: TiktokPixelEventName[] = [];
  for (const item of input) {
    const name = String(item ?? "").trim();
    if (!name || seen.has(name) || !isTiktokPixelEventName(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out.length > 0 ? out : [...TIKTOK_PIXEL_DEFAULT_EVENTS];
}

export function parseTiktokEnabledEventsFromStore(value: unknown): TiktokPixelEventName[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const out: TiktokPixelEventName[] = [];
  for (const item of value) {
    const name = String(item ?? "").trim();
    if (!name || seen.has(name) || !isTiktokPixelEventName(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export const TIKTOK_PIXEL_METAFIELD_NAMESPACE = "spark_tiktok";
export const TIKTOK_PIXEL_METAFIELD_KEY = "pixel_config";

export type TiktokPixelStorefrontConfig = {
  pixelCode: string;
  enabledEvents: TiktokPixelEventName[];
  eventsApiEnabled: boolean;
};

export function buildTiktokEventsManagerUrl(pixelCode?: string): string {
  const code = pixelCode?.trim();
  if (code) {
    return `https://ads.tiktok.com/i18n/events_manager/pixel/detail/${encodeURIComponent(code)}`;
  }
  return "https://ads.tiktok.com/i18n/events_manager/";
}

/** Events Manager 测试事件页（获取 Test Event Code）。 */
export function buildTiktokEventsManagerTestUrl(pixelCode?: string): string {
  const code = pixelCode?.trim();
  if (code) {
    return `https://ads.tiktok.com/i18n/events_manager/pixel/detail/${encodeURIComponent(code)}?tab=test`;
  }
  return "https://ads.tiktok.com/i18n/events_manager/";
}

/** Theme App Embed 的 Liquid 文件名（无扩展名），用于 activateAppId deep link。 */
export const TIKTOK_PIXEL_APP_EMBED_HANDLE = "tiktok-pixel-embed";

function normalizeMyshopifyDomain(shop: string): string {
  const trimmed = shop.trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.includes(".") ? trimmed : `${trimmed}.myshopify.com`;
}

function shopifyAdminStoreHandle(shop: string): string {
  return normalizeMyshopifyDomain(shop).replace(/\.myshopify\.com$/i, "");
}

/**
 * 主题编辑器 App embeds deep link：打开并预激活 Spark TikTok Pixel。
 * @see https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration#app-embed-block-deep-linking
 */
export function buildTiktokPixelThemeEditorUrl(params: {
  shopDomain: string;
  apiKey: string;
}): string | null {
  const apiKey = params.apiKey.trim();
  const storeHandle = shopifyAdminStoreHandle(params.shopDomain);
  if (!apiKey || !storeHandle) return null;
  // activateAppId 必须保留 api_key/handle 中间的 `/`（不要被 encode 成 %2F）
  const activateAppId = `${encodeURIComponent(apiKey)}/${TIKTOK_PIXEL_APP_EMBED_HANDLE}`;
  return `https://admin.shopify.com/store/${encodeURIComponent(storeHandle)}/themes/current/editor?context=apps&activateAppId=${activateAppId}`;
}

/** 店面首页 URL，用于浏览/加购等事件实测。 */
export function buildShopOnlineStoreUrl(shopDomain: string): string | null {
  const domain = normalizeMyshopifyDomain(shopDomain);
  if (!domain) return null;
  return `https://${domain}/`;
}
