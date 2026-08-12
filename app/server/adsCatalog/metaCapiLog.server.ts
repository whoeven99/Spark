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
