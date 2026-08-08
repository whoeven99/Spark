/**
 * Google Pixel → SLS Activity 共享常量（店面 mirror 与商户查询页对齐）。
 * 不依赖 Node / Prisma，可被客户端与服务端共用。
 */

export const GOOGLE_PIXEL_SLS_TOPIC_PREFIX = "spark:google:" as const;

/** Activity 卡片 / 漏斗关注的核心事件（与 ScaleUp Event activity 对齐）。 */
export const GOOGLE_PIXEL_ACTIVITY_EVENTS = [
  "page_view",
  "add_to_cart",
  "begin_checkout",
  "add_payment_info",
  "purchase",
] as const;

export type GooglePixelActivityEvent = (typeof GOOGLE_PIXEL_ACTIVITY_EVENTS)[number];

/** 日趋势折线默认展示的事件（不含 page_view，避免量级淹没转化线）。 */
export const GOOGLE_PIXEL_ACTIVITY_TREND_EVENTS = [
  "add_to_cart",
  "begin_checkout",
  "add_payment_info",
  "purchase",
] as const;

/** 漏斗阶梯（不含 page_view）。 */
export const GOOGLE_PIXEL_ACTIVITY_FUNNEL_EVENTS = [
  "add_to_cart",
  "begin_checkout",
  "add_payment_info",
  "purchase",
] as const;

export function toGooglePixelSlsEvent(googleEvent: string): string {
  return `${GOOGLE_PIXEL_SLS_TOPIC_PREFIX}${googleEvent}`;
}

export function fromGooglePixelSlsEvent(event: string): string {
  const trimmed = event.trim();
  if (trimmed.startsWith(GOOGLE_PIXEL_SLS_TOPIC_PREFIX)) {
    return trimmed.slice(GOOGLE_PIXEL_SLS_TOPIC_PREFIX.length);
  }
  return trimmed;
}

export function isGooglePixelActivityEvent(
  value: string,
): value is GooglePixelActivityEvent {
  return (GOOGLE_PIXEL_ACTIVITY_EVENTS as readonly string[]).includes(value);
}

export type GooglePixelActivityRange = "1" | "7" | "30";

export function resolveActivityRangeMs(range: GooglePixelActivityRange): number {
  const days = range === "1" ? 1 : range === "30" ? 30 : 7;
  return days * 24 * 3600_000;
}

export function parseActivityRange(value: string | null | undefined): GooglePixelActivityRange {
  if (value === "1" || value === "30") return value;
  return "7";
}
