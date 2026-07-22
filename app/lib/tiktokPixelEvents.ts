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
