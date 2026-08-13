import crypto from "node:crypto";
import { META_GRAPH_VERSION } from "../metaOAuth.server";
import {
  formatFieldsForLog,
  formatMetaCapiTokenForLog,
  formatUrlForLog,
  logFullMetaCapiAccessToken,
  shouldLogFullMetaCapiErrorBody,
} from "../metaCapiLog.server";

const LOG_PREFIX = "[AdsCatalog][MetaCAPI]";
const FB_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

type MetaCapiGraphError = {
  message?: string;
  error_user_msg?: string;
  code?: number;
  type?: string;
};

export class MetaCapiTrackError extends Error {
  readonly httpStatus: number;
  readonly errorCode?: number;
  readonly errorType?: string;

  constructor(message: string, params: { httpStatus: number; errorCode?: number; errorType?: string }) {
    super(message);
    this.name = "MetaCapiTrackError";
    this.httpStatus = params.httpStatus;
    this.errorCode = params.errorCode;
    this.errorType = params.errorType;
  }
}

/** Meta CAPI token 失效/过期（OAuthException 190/102 或 HTTP 401）。 */
export function isMetaCapiTokenAuthError(error: unknown): boolean {
  if (error instanceof MetaCapiTrackError) {
    if (error.httpStatus === 401) return true;
    if (error.errorCode === 190 || error.errorCode === 102) return true;
    if (error.errorType === "OAuthException") return true;
  }
  if (error instanceof Error) {
    return /invalid.*access token|session has expired|OAuthException|error validating access token/i.test(
      error.message,
    );
  }
  return false;
}

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
  /** CAPI user_data.client_ip_address（明文，不哈希）。 */
  clientIpAddress?: string;
  /** CAPI user_data.client_user_agent（明文，不哈希）。 */
  clientUserAgent?: string;
  testEventCode?: string;
  eventSourceUrl?: string;
};

export function resolveClientIpFromHeaders(headers: Headers): string | undefined {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  for (const key of ["cf-connecting-ip", "x-real-ip"] as const) {
    const value = headers.get(key)?.trim();
    if (value) return value;
  }
  return undefined;
}

export function buildMetaCapiUserData(params: {
  email?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
}): Record<string, string | string[]> {
  const userData: Record<string, string | string[]> = {};
  if (params.email?.trim()) {
    userData.em = [hashMetaEmail(params.email)];
  }
  if (params.clientIpAddress?.trim()) {
    userData.client_ip_address = params.clientIpAddress.trim();
  }
  if (params.clientUserAgent?.trim()) {
    userData.client_user_agent = params.clientUserAgent.trim();
  }
  return userData;
}

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

  const userData = buildMetaCapiUserData({
    email: params.email,
    clientIpAddress: params.clientIpAddress,
    clientUserAgent: params.clientUserAgent,
  });

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
    `${LOG_PREFIX} step=track_request pixelId=${pixelId} event=${eventName} eventId=${params.eventId ?? ""} test=${params.testEventCode?.trim() ? "1" : "0"} testEventCode=${params.testEventCode?.trim() ?? ""} token=${formatMetaCapiTokenForLog(token)} tokenLen=${token.length} body=${formatFieldsForLog(body)}`,
  );
  logFullMetaCapiAccessToken({
    token,
    source: "meta_capi_events_request",
    pixelId,
    eventName,
  });

  const url = `${FB_GRAPH_BASE}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`;
  console.info(
    `${LOG_PREFIX} step=track_http method=POST url=${formatUrlForLog(url)}`,
  );
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload: { error?: MetaCapiGraphError } = {};
  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {};
  } catch {
    payload = {};
  }

  const bodyPreview = shouldLogFullMetaCapiErrorBody() ? text : text.slice(0, 500);
  console.info(
    `${LOG_PREFIX} step=track_response http=${response.status} body=${bodyPreview}`,
  );

  if (!response.ok || payload.error) {
    const graphError = payload.error;
    const detail =
      graphError?.error_user_msg ||
      graphError?.message ||
      text.slice(0, 200) ||
      response.statusText;
    throw new MetaCapiTrackError(`Meta CAPI track failed: HTTP ${response.status} ${detail}`.trim(), {
      httpStatus: response.status,
      errorCode: graphError?.code,
      errorType: graphError?.type,
    });
  }
}
