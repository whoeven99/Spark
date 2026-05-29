/**
 * 邮件模块日志：结构化 console，不记录 secret / token。
 */

export const EMAIL_LOG = {
  service: "[Email][Service]",
  tencent: "[Email][Tencent]",
  request: "[Email][Request]",
  response: "[Email][Response]",
  error: "[Email][Error]",
} as const;

export function logEmailInfo(prefix: string, message: string): void {
  console.info(`${prefix} ${message}`);
}

export function logEmailError(
  prefix: string,
  label: string,
  error: unknown,
  extra?: Record<string, string | number | boolean>,
): void {
  const lines: string[] = [`${prefix} ${label}`];
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      lines.push(`${key}: ${String(value)}`);
    }
  }
  if (error instanceof Error) {
    lines.push(`error.message: ${error.message}`);
    lines.push(`error.stack: ${error.stack ?? "(no stack)"}`);
  } else {
    lines.push(`error: ${String(error)}`);
  }
  console.error(lines.join("\n"));
}
