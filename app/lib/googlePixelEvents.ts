/** ScaleUp 风格 Google Pixel 可配置事件（店面 + 结账）。 */

export const GOOGLE_PIXEL_RECOMMENDED_EVENTS = [
  "page_view",
  "add_to_cart",
  "begin_checkout",
  "purchase",
] as const;

export const GOOGLE_PIXEL_OPTIONAL_EVENTS = ["add_payment_info"] as const;

export const GOOGLE_PIXEL_SETUP_EVENTS = [
  ...GOOGLE_PIXEL_RECOMMENDED_EVENTS,
  ...GOOGLE_PIXEL_OPTIONAL_EVENTS,
] as const;

export type GooglePixelSetupEvent = (typeof GOOGLE_PIXEL_SETUP_EVENTS)[number];

/** 通过 Theme App Embed 上报的店面事件（不含 purchase / payment）。 */
export const GOOGLE_PIXEL_STOREFRONT_EVENTS = [
  "page_view",
  "add_to_cart",
  "begin_checkout",
  "add_payment_info",
] as const;

export type GooglePixelStorefrontEvent = (typeof GOOGLE_PIXEL_STOREFRONT_EVENTS)[number];

export type GooglePixelEventConversion = {
  label: string;
  conversionActionId?: string;
  name: string;
  disabled?: boolean;
};

export type GooglePixelEventConversions = Partial<
  Record<GooglePixelSetupEvent, GooglePixelEventConversion>
>;

export const GOOGLE_PIXEL_EVENT_ADS_CATEGORY: Record<
  GooglePixelSetupEvent,
  string
> = {
  page_view: "PAGE_VIEW",
  add_to_cart: "ADD_TO_CART",
  begin_checkout: "BEGIN_CHECKOUT",
  purchase: "PURCHASE",
  add_payment_info: "DEFAULT",
};

export function isGooglePixelSetupEvent(value: string): value is GooglePixelSetupEvent {
  return (GOOGLE_PIXEL_SETUP_EVENTS as readonly string[]).includes(value);
}

export function normalizeGooglePixelSetupEvents(value: unknown): GooglePixelSetupEvent[] {
  if (!Array.isArray(value)) return [...GOOGLE_PIXEL_RECOMMENDED_EVENTS];
  return [...new Set(value.filter((item): item is GooglePixelSetupEvent =>
    typeof item === "string" && isGooglePixelSetupEvent(item),
  ))];
}

export function buildGooglePixelConversionActionName(params: {
  pixelName: string;
  eventKey: GooglePixelSetupEvent;
  eventDisplayName: string;
}): string {
  const base = params.pixelName.trim() || "Spark Pixel";
  return `${base} (${params.eventDisplayName})`;
}

/** 从旧版单 Label 配置迁移到 eventConversions（全部启用事件共用同一 label）。 */
export function migrateLegacyEventConversions(params: {
  enabledEvents: string[];
  conversionLabel?: string;
  pixelName?: string;
  labelOf: (event: GooglePixelSetupEvent) => string;
}): GooglePixelEventConversions {
  const label = (params.conversionLabel ?? "").trim();
  if (!label) return {};
  const out: GooglePixelEventConversions = {};
  for (const event of GOOGLE_PIXEL_SETUP_EVENTS) {
    if (!params.enabledEvents.includes(event)) continue;
    out[event] = {
      label,
      name: buildGooglePixelConversionActionName({
        pixelName: params.pixelName ?? "Spark Pixel",
        eventKey: event,
        eventDisplayName: params.labelOf(event),
      }),
    };
  }
  if (params.enabledEvents.includes("purchase") && !out.purchase) {
    out.purchase = {
      label,
      name: buildGooglePixelConversionActionName({
        pixelName: params.pixelName ?? "Spark Pixel",
        eventKey: "purchase",
        eventDisplayName: params.labelOf("purchase"),
      }),
    };
  }
  return out;
}

export function resolveEventConversionLabel(
  eventConversions: GooglePixelEventConversions | undefined,
  event: string,
  fallbackLabel?: string,
): string {
  const entry = eventConversions?.[event as GooglePixelSetupEvent];
  if (entry?.label && !entry.disabled) return entry.label;
  return (fallbackLabel ?? "").trim();
}

export function listActivePixelSetupEvents(params: {
  enabledEvents: string[];
  eventConversions?: GooglePixelEventConversions;
}): GooglePixelSetupEvent[] {
  const enabled = new Set(params.enabledEvents);
  return GOOGLE_PIXEL_SETUP_EVENTS.filter((event) => {
    if (!enabled.has(event)) return false;
    const entry = params.eventConversions?.[event];
    return !entry?.disabled;
  });
}
