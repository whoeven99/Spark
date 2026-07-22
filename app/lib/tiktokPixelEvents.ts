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
  /**
   * 有值时 Theme Embed 的 ttq 带 test_event_code。
   * 写入 metafield 可避开密码店 302 丢 query；测完须清除。
   */
  testEventCode?: string;
  /**
   * 测试模式下店面双发 Events API 的公开端点（仅 testEventCode 有值时写入）。
   * Theme Embed fetch 此 URL，使浏览/加购出现在 Test Events「服务器」侧。
   */
  storefrontTrackUrl?: string;
};

/** 店面测试事件双发端点（依赖 SHOPIFY_APP_URL）。 */
export function buildTiktokStorefrontTrackUrl(): string | null {
  const appUrl = process.env.SHOPIFY_APP_URL?.trim().replace(/\/+$/, "");
  if (!appUrl) return null;
  return `${appUrl}/api/ads-catalog/tiktok-storefront-track`;
}

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

/**
 * 店面测试会话查询参数。
 * Theme App Embed 读到后写入 sessionStorage，仅当前浏览器会话的 ttq 带 test_event_code。
 */
export const TIKTOK_STOREFRONT_TEST_EVENT_QUERY = "spark_tt_test_code";

/** 店面首页 URL，用于浏览/加购等事件实测。 */
export function buildShopOnlineStoreUrl(
  shopDomain: string,
  options?: { testEventCode?: string | null },
): string | null {
  const domain = normalizeMyshopifyDomain(shopDomain);
  if (!domain) return null;
  const url = new URL(`https://${domain}/`);
  if (options && "testEventCode" in options) {
    url.searchParams.set(
      TIKTOK_STOREFRONT_TEST_EVENT_QUERY,
      options.testEventCode?.trim() ?? "",
    );
  }
  return url.toString();
}
