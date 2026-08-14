/**
 * Meta Pixel / Conversions API 标准事件名与默认勾选配置。
 */

export const META_PIXEL_DEFAULT_EVENTS = [
  "ViewContent",
  "AddToCart",
  "InitiateCheckout",
  "Purchase",
] as const;

export const META_PIXEL_OPTIONAL_EVENTS = ["PageView", "Search"] as const;

export const META_PIXEL_ALL_EVENTS = [
  ...META_PIXEL_DEFAULT_EVENTS,
  ...META_PIXEL_OPTIONAL_EVENTS,
] as const;

export type MetaPixelEventName = (typeof META_PIXEL_ALL_EVENTS)[number];

const ALL_SET = new Set<string>(META_PIXEL_ALL_EVENTS);

export function isMetaPixelEventName(value: string): value is MetaPixelEventName {
  return ALL_SET.has(value);
}

/** 规范化 enabledEvents：去重、过滤非法名；空输入回落默认勾选。 */
export function normalizeMetaEnabledEvents(input: unknown): MetaPixelEventName[] {
  if (!Array.isArray(input)) {
    return [...META_PIXEL_DEFAULT_EVENTS];
  }
  const seen = new Set<string>();
  const out: MetaPixelEventName[] = [];
  for (const item of input) {
    const name = String(item ?? "").trim();
    if (!name || seen.has(name) || !isMetaPixelEventName(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out.length > 0 ? out : [...META_PIXEL_DEFAULT_EVENTS];
}

export const META_PIXEL_METAFIELD_NAMESPACE = "spark_meta";
export const META_PIXEL_METAFIELD_KEY = "pixel_config";

export type MetaPixelStorefrontConfig = {
  pixelId: string;
  enabledEvents: MetaPixelEventName[];
  capiEnabled: boolean;
  /** 有值时 Theme Embed 的 fbq 带 test_event_code。 */
  testEventCode?: string;
  /** 测试模式下店面双发 CAPI 的公开端点。 */
  storefrontTrackUrl?: string;
};

export function buildMetaStorefrontTrackUrl(): string | null {
  const appUrl = process.env.SHOPIFY_APP_URL?.trim().replace(/\/+$/, "");
  if (!appUrl) return null;
  return `${appUrl}/api/ads-catalog/meta-storefront-track`;
}

export function buildMetaEventsManagerUrl(pixelId?: string): string {
  const id = pixelId?.trim();
  if (id) {
    return `https://business.facebook.com/events_manager2/list/pixel/${encodeURIComponent(id)}`;
  }
  return "https://business.facebook.com/events_manager2/";
}

export function buildMetaEventsManagerTestUrl(pixelId?: string): string {
  const id = pixelId?.trim();
  if (id) {
    return `https://business.facebook.com/events_manager2/list/pixel/${encodeURIComponent(id)}/test_events`;
  }
  return "https://business.facebook.com/events_manager2/";
}

export const META_PIXEL_APP_EMBED_HANDLE = "meta-pixel-embed";

export const META_STOREFRONT_TEST_EVENT_QUERY = "spark_meta_test_code";

function normalizeMyshopifyDomain(shop: string): string {
  const trimmed = shop.trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.includes(".") ? trimmed : `${trimmed}.myshopify.com`;
}

function shopifyAdminStoreHandle(shop: string): string {
  return normalizeMyshopifyDomain(shop).replace(/\.myshopify\.com$/i, "");
}

export function buildMetaPixelThemeEditorUrl(params: {
  shopDomain: string;
  apiKey: string;
}): string | null {
  const apiKey = params.apiKey.trim();
  const storeHandle = shopifyAdminStoreHandle(params.shopDomain);
  if (!apiKey || !storeHandle) return null;
  const activateAppId = `${encodeURIComponent(apiKey)}/${META_PIXEL_APP_EMBED_HANDLE}`;
  return `https://admin.shopify.com/store/${encodeURIComponent(storeHandle)}/themes/current/editor?context=apps&activateAppId=${activateAppId}`;
}

export function buildMetaShopOnlineStoreUrl(
  shopDomain: string,
  options?: { testEventCode?: string | null },
): string | null {
  const domain = normalizeMyshopifyDomain(shopDomain);
  if (!domain) return null;
  const url = new URL(`https://${domain}/`);
  if (options && "testEventCode" in options) {
    url.searchParams.set(
      META_STOREFRONT_TEST_EVENT_QUERY,
      options.testEventCode?.trim() ?? "",
    );
  }
  return url.toString();
}
