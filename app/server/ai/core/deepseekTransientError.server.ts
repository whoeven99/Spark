function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;
  for (const value of [record.status, record.statusCode, record.code]) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 400 && n < 600) return n;
  }
  const response = record.response;
  if (response && typeof response === "object" && "status" in response) {
    const n = Number((response as { status?: unknown }).status);
    if (Number.isFinite(n) && n >= 400 && n < 600) return n;
  }
  const match = errorText(error).match(/\b([45]\d\d)\b/);
  return match ? Number(match[1]) : null;
}

/** DeepSeek 账号并发打满时返回 429。 */
export function isDeepseekRateLimited(error: unknown): boolean {
  const status = errorStatus(error);
  if (status === 429) return true;
  return /rate.?limit|too many requests|concurrency|tpm|rpm/i.test(
    errorText(error),
  );
}

/**
 * 思考模式 + tools 时未回传 reasoning_content，官方返回 400。
 * 同请求重试无效，需改走无工具兜底。
 */
export function isDeepseekReasoningContentError(error: unknown): boolean {
  return /reasoning_content/i.test(errorText(error));
}

export function isDeepseekRetryable(error: unknown): boolean {
  if (isDeepseekRateLimited(error)) return true;
  const status = errorStatus(error);
  if (status != null && status >= 500) return true;
  return /ECONNRESET|ETIMEDOUT|socket hang up|timeout/i.test(errorText(error));
}

export const DEEPSEEK_BUSY_USER_MESSAGE =
  "我这边刚刚有点忙，请稍后再试一次。";

export const DEEPSEEK_BUSY_USER_MESSAGE_EN =
  "I'm a bit busy right now. Please try again in a moment.";

export function deepseekBusyUserMessage(locale?: string): string {
  return locale === "en"
    ? DEEPSEEK_BUSY_USER_MESSAGE_EN
    : DEEPSEEK_BUSY_USER_MESSAGE;
}
