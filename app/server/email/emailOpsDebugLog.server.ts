import {
  isEmailSendReady,
  loadEmailConfig,
} from "./config/emailConfig.server";
import {
  resolveOpsNotifyEmail,
  resolveOpsUninstallTemplateId,
} from "./opsNotifyEmail.server";
import { TENCENT_FROM_EMAIL } from "./templates/emailTemplates.server";
import type { SendEmailResult } from "./types/sendEmailResult";

export type EmailOpsRoutingLog = {
  from: string;
  to: string;
  cc?: string;
};

/** 运营邮件发信路由（完整邮箱，供 after-send 日志） */
export function buildOpsRoutingLog(to: string): EmailOpsRoutingLog {
  const config = loadEmailConfig();
  const cc = config.tencent?.cc ?? [];
  return {
    from: config.tencent?.fromEmail ?? TENCENT_FROM_EMAIL,
    to,
    cc: cc.length > 0 ? cc.join(",") : "(none)",
  };
}

export function logEmailOpsPreflight(
  logPrefix: string,
  context: Record<string, string | number | boolean | null | undefined>,
): void {
  const config = loadEmailConfig();
  const recipient = resolveOpsNotifyEmail();
  const uninstallTemplateId = resolveOpsUninstallTemplateId();

  console.info(
    `${logPrefix} preflight ${JSON.stringify({
      ...context,
      emailEnabled: config.enabled,
      emailProvider: config.provider,
      emailSendReady: isEmailSendReady(config),
      hasTencentCredentials: config.tencent != null,
      opsNotifyRecipient: recipient ?? null,
      defaultFromEmail: config.tencent?.fromEmail ?? null,
      defaultCc: config.tencent?.cc?.join(",") ?? null,
      opsUninstallTemplateId: uninstallTemplateId,
    })}`,
  );
}

export function logEmailOpsAfterSend(
  logPrefix: string,
  shop: string,
  result: SendEmailResult | { ok: false; skipped: true; reason: string },
  routing?: EmailOpsRoutingLog,
): void {
  const routingSuffix = routing
    ? ` from=${routing.from} to=${routing.to} cc=${routing.cc ?? "(none)"}`
    : "";

  if ("skipped" in result && result.skipped) {
    console.info(
      `${logPrefix} after-send shop=${shop} outcome=skipped reason=${result.reason}${routingSuffix}`,
    );
    return;
  }

  if (result.ok) {
    console.info(
      `${logPrefix} after-send shop=${shop} outcome=success requestId=${result.requestId ?? "(none)"}${routingSuffix}`,
    );
    return;
  }

  if ("error" in result) {
    console.error(
      `${logPrefix} after-send shop=${shop} outcome=failed code=${result.error.code} message=${result.error.message}${routingSuffix}`,
    );
  }
}
