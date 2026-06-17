/**
 * Normalize low-level fetch/network errors into merchant-facing hints.
 */
export function formatOutboundNetworkError(raw: unknown): string {
  const message = raw instanceof Error ? raw.message : String(raw);
  if (
    /fetch failed|network error|timeout|aborted|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(
      message,
    )
  ) {
    return "无法连接外部 API（网络超时或被拦截）。请使用可访问目标服务的网络，或在运行环境配置 HTTPS_PROXY / HTTP_PROXY 代理后重试。";
  }
  return message;
}
