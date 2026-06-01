import { loadEmailConfig } from "./config/emailConfig.server";

export type OpsEmailSessionSnapshot = {
  email?: string | null;
  locale?: string | null;
};

/**
 * 运营/商户通知兜底收件人：OPS_NOTIFY_EMAIL，未配置时取 TENCENT_SES_CC 首地址。
 */
export function resolveOpsNotifyEmail(): string | null {
  const explicit = process.env.OPS_NOTIFY_EMAIL?.trim();
  if (explicit && explicit.length > 0) return explicit;

  const cc = loadEmailConfig().tencent?.cc ?? [];
  const first = cc[0]?.trim();
  return first && first.length > 0 ? first : null;
}

/**
 * SES Destination（To）：优先 Session 中的店主邮箱，缺失时回退运营通知地址。
 */
export function resolveOpsEmailDestination(
  sessionSnapshot?: OpsEmailSessionSnapshot | null,
): string | null {
  const ownerEmail = sessionSnapshot?.email?.trim();
  if (ownerEmail) return ownerEmail;
  return resolveOpsNotifyEmail();
}
