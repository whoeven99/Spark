/** 请求头里能确认的访客国家；无法确认时返回 null，展示层按 UTC。 */

const COUNTRY_HEADERS = [
  "cf-ipcountry",
  "x-vercel-ip-country",
  "cloudfront-viewer-country",
  "x-country-code",
  "x-appengine-country",
] as const;

const UNKNOWN_COUNTRY_CODES = new Set(["XX", "T1", "ZZ"]);

export const CONVERSATION_DISPLAY_TIME_ZONE_UTC = "UTC";
export const CONVERSATION_DISPLAY_TIME_ZONE_CN = "Asia/Shanghai";

export function resolveViewerCountryCode(headers: Headers): string | null {
  for (const name of COUNTRY_HEADERS) {
    const raw = headers.get(name)?.trim().toUpperCase();
    if (!raw || UNKNOWN_COUNTRY_CODES.has(raw)) continue;
    if (/^[A-Z]{2}$/.test(raw)) return raw;
  }
  return null;
}

/** 仅当请求头确认是中国大陆 IP 时用上海时区，否则 UTC。 */
export function resolveConversationDisplayTimeZone(headers: Headers): string {
  return resolveViewerCountryCode(headers) === "CN"
    ? CONVERSATION_DISPLAY_TIME_ZONE_CN
    : CONVERSATION_DISPLAY_TIME_ZONE_UTC;
}
