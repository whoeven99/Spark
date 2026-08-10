import crypto from "node:crypto";
import { META_GRAPH_VERSION } from "../metaOAuth.server";

const LOG_PREFIX = "[AdsCatalog][MetaCAPI]";
const FB_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export type TrackMetaPixelEventParams = {
  pixelId: string;
  capiAccessToken: string;
  eventName: string;
  eventId?: string;
  /** Unix seconds；缺省为当前时刻。 */
  eventTime?: number;
  customData?: Record<string, unknown>;
  /** 明文 email，发送前会 SHA256 规范化哈希。 */
  email?: string;
  testEventCode?: string;
  eventSourceUrl?: string;
};

/** Meta CAPI 要求 em 等为 SHA256( lowercase trimmed )。 */
export function hashMetaEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Conversions API 单条事件上报。
 * POST /{pixel-id}/events
 */
export async function trackMetaPixelEvent(params: TrackMetaPixelEventParams): Promise<void> {
  const pixelId = params.pixelId.trim();
  const token = params.capiAccessToken.trim();
  const eventName = params.eventName.trim();
  if (!pixelId || !token || !eventName) {
    throw new Error("Meta CAPI track requires pixelId, capiAccessToken, and eventName");
  }

  const eventTime =
    typeof params.eventTime === "number" && Number.isFinite(params.eventTime)
      ? Math.floor(params.eventTime)
      : Math.floor(Date.now() / 1000);

  const userData: Record<string, string> = {};
  if (params.email?.trim()) {
    userData.em = hashMetaEmail(params.email);
  }

  const eventPayload: Record<string, unknown> = {
    event_name: eventName,
    event_time: eventTime,
    action_source: "website",
  };
  if (params.eventId?.trim()) eventPayload.event_id = params.eventId.trim();
  if (Object.keys(userData).length > 0) eventPayload.user_data = userData;
  if (params.customData && Object.keys(params.customData).length > 0) {
    eventPayload.custom_data = params.customData;
  }
  if (params.eventSourceUrl?.trim()) {
    eventPayload.event_source_url = params.eventSourceUrl.trim();
  }

  const body: Record<string, unknown> = {
    data: [eventPayload],
  };
  if (params.testEventCode?.trim()) {
    body.test_event_code = params.testEventCode.trim();
  }

  console.info(
    `${LOG_PREFIX} step=track_request pixelId=${pixelId} event=${eventName} eventId=${params.eventId ?? ""} test=${params.testEventCode?.trim() ? "1" : "0"}`,
  );

  const url = `${FB_GRAPH_BASE}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload: { error?: { message?: string; error_user_msg?: string } } = {};
  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {};
  } catch {
    payload = {};
  }

  console.info(
    `${LOG_PREFIX} step=track_response http=${response.status} body=${text.slice(0, 200)}`,
  );

  if (!response.ok || payload.error) {
    const detail =
      payload.error?.error_user_msg ||
      payload.error?.message ||
      text.slice(0, 200) ||
      response.statusText;
    throw new Error(`Meta CAPI track failed: HTTP ${response.status} ${detail}`.trim());
  }
}
