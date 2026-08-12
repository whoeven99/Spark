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
