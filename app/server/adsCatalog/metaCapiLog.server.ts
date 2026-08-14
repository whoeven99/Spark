/** Meta CAPI token 日志辅助；完整 token 仅 DEBUG 环境变量开启时输出。 */

export function shouldLogFullMetaCapiToken(): boolean {
  const v = process.env.META_CAPI_LOG_FULL_TOKEN?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function maskMetaCapiTokenForLog(value: string): string {
  if (value.length <= 6) return `${value.slice(0, 1)}***`;
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

export function formatMetaCapiTokenForLog(value: string): string {
  return shouldLogFullMetaCapiToken() ? value : maskMetaCapiTokenForLog(value);
}

/**
 * 调试 CAPI Token 获取/发送链路时输出完整 Token。
 *
 * 仅允许在服务端调用；不要把这个值返回给浏览器或写入店面 metafield。
 * 这是有意保留的敏感日志，便于核对 Meta 返回的 Token 是否发生变化。
 */
export function logFullMetaCapiAccessToken(params: {
  token: string;
  source: string;
  shop?: string;
  pixelId?: string;
  eventName?: string;
}): void {
  const token = params.token.trim();
  if (!token) return;

  const parts = [
    "[MetaCAPI][FullTokenDebug]",
    `source=${params.source}`,
    `shop=${params.shop?.trim().toLowerCase() ?? ""}`,
    `pixelId=${params.pixelId?.trim() ?? ""}`,
    `event=${params.eventName?.trim() ?? ""}`,
    `tokenLen=${token.length}`,
    `capiAccessToken=${token}`,
  ];
  console.info(parts.join(" "));
}

export function shouldLogFullMetaCapiErrorBody(): boolean {
  if (shouldLogFullMetaCapiToken()) return true;
  const v = process.env.META_CAPI_LOG_FULL_ERROR?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

const SENSITIVE_FIELD_PATTERN =
  /token|secret|proof|password|authorization/i;

/** URL 查询参数中的 access_token 脱敏。 */
export function formatUrlForLog(url: string): string {
  try {
    const parsed = new URL(url);
    const token = parsed.searchParams.get("access_token");
    if (token) {
      parsed.searchParams.set("access_token", formatMetaCapiTokenForLog(token));
    }
    return parsed.toString();
  } catch {
    return url.replace(/access_token=[^&]+/i, (match) => {
      const value = match.split("=")[1] ?? "";
      return `access_token=${formatMetaCapiTokenForLog(decodeURIComponent(value))}`;
    });
  }
}

/** 表单/JSON 字段脱敏后序列化，便于排查请求体。 */
export function formatFieldsForLog(fields: Record<string, unknown>): string {
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value == null) {
      masked[key] = value;
      continue;
    }
    const str = String(value);
    masked[key] = SENSITIVE_FIELD_PATTERN.test(key)
      ? formatMetaCapiTokenForLog(str)
      : str;
  }
  return JSON.stringify(masked);
}
