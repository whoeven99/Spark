import { maskEmail } from "./emailLog.server";

/**
 * 测试环境将全部邮件 To 重定向到该地址（见 EMAIL_TEST_RECIPIENT）。
 * 未配置时返回 null，走正常收件人解析。
 */
export function resolveEmailTestRecipientOverride(): string | null {
  const value = process.env.EMAIL_TEST_RECIPIENT?.trim();
  return value && value.length > 0 ? value : null;
}

export function applyEmailTestRecipientOverride<T extends { to: string; cc?: string[] }>(
  params: T,
): T & { originalTo?: string } {
  const override = resolveEmailTestRecipientOverride();
  if (!override || params.to.trim() === override) {
    return params;
  }
  return {
    ...params,
    to: override,
    cc: undefined,
    originalTo: params.to,
  };
}

export function logEmailTestRecipientOverride(
  prefix: string,
  originalTo: string | undefined,
): void {
  const override = resolveEmailTestRecipientOverride();
  if (!override || !originalTo || originalTo.trim() === override) return;
  console.info(
    `${prefix} EMAIL_TEST_RECIPIENT override: ${maskEmail(originalTo)} -> ${maskEmail(override)}`,
  );
}
