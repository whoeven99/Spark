/**

 * 邮件模块日志：结构化 console，不记录 secret / token。

 */



export const EMAIL_LOG = {

  service: "[Email][Service]",

  tencent: "[Email][Tencent]",

  error: "[Email][Error]",

} as const;



/** 日志中脱敏邮箱，保留域名与本地部分前 2 字符便于排查。 */

export function maskEmail(email: string): string {

  const trimmed = email.trim();

  const at = trimmed.indexOf("@");

  if (at <= 0) return "(invalid)";

  const local = trimmed.slice(0, at);

  const domain = trimmed.slice(at + 1);

  const visible = local.slice(0, Math.min(2, local.length));

  return `${visible}***@${domain}`;

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


