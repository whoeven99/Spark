export interface OutboundErrorDetail {
  message: string;
  name?: string;
  code?: string;
  cause?: string;
}

function readErrorCode(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || !("code" in value)) return undefined;
  const code = (value as { code?: unknown }).code;
  return code === undefined || code === null ? undefined : String(code);
}

function readErrorCause(error: unknown): unknown {
  if (error instanceof Error && "cause" in error) {
    return (error as Error & { cause?: unknown }).cause;
  }
  return undefined;
}

/** 提取 fetch / undici 等底层网络错误的 message、cause、code，便于服务端日志排查。 */
export function describeOutboundError(raw: unknown): OutboundErrorDetail {
  if (!(raw instanceof Error)) {
    return { message: String(raw) };
  }

  const detail: OutboundErrorDetail = {
    message: raw.message,
    name: raw.name,
    code: readErrorCode(raw),
  };

  const cause = readErrorCause(raw);
  if (cause instanceof Error) {
    const nested = describeOutboundError(cause);
    detail.cause = nested.code ? `${nested.message} (code=${nested.code})` : nested.message;
    detail.code ??= nested.code ?? readErrorCode(cause);
  } else if (cause !== undefined) {
    detail.cause = String(cause);
  }

  return detail;
}

/** 单行日志格式：message | code=... | cause=... */
export function formatOutboundErrorLog(raw: unknown): string {
  const detail = describeOutboundError(raw);
  const parts = [detail.message];
  if (detail.code) parts.push(`code=${detail.code}`);
  if (detail.cause) parts.push(`cause=${detail.cause}`);
  return parts.join(" | ");
}

/**
 * Normalize low-level fetch/network errors into merchant-facing hints.
 */
export function formatOutboundNetworkError(raw: unknown): string {
  const detail = describeOutboundError(raw);
  const combined = [detail.message, detail.cause].filter(Boolean).join(": ");
  if (
    /fetch failed|network error|timeout|aborted|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|UND_ERR_/i.test(
      combined,
    )
  ) {
    return "无法连接外部 API（网络超时或被拦截）。请使用可访问目标服务的网络，或在运行环境配置 HTTPS_PROXY / HTTP_PROXY 代理后重试。";
  }
  return detail.message;
}
