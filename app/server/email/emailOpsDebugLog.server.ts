import {
  isEmailSendReady,
  loadEmailConfig,
} from "./config/emailConfig.server";
import { resolveOpsNotifyEmail } from "./opsNotifyEmail.server";
import type { SendEmailResult } from "./types/sendEmailResult";

function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0) return "(invalid)";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

export function logEmailOpsPreflight(
  logPrefix: string,
  context: Record<string, string | number | boolean | null | undefined>,
): void {
  const config = loadEmailConfig();
  const recipient = resolveOpsNotifyEmail();

  console.info(
    `${logPrefix} preflight ${JSON.stringify({
      ...context,
      emailEnabled: config.enabled,
      emailProvider: config.provider,
      emailSendReady: isEmailSendReady(config),
      hasTencentCredentials: config.tencent != null,
      opsNotifyRecipient: recipient ? maskEmail(recipient) : null,
    })}`,
  );
}

export function logEmailOpsAfterSend(
  logPrefix: string,
  shop: string,
  result: SendEmailResult | { ok: false; skipped: true; reason: string },
): void {
  if ("skipped" in result && result.skipped) {
    console.info(
      `${logPrefix} after-send shop=${shop} outcome=skipped reason=${result.reason}`,
    );
    return;
  }

  if (result.ok) {
    console.info(
      `${logPrefix} after-send shop=${shop} outcome=success requestId=${result.requestId ?? "(none)"}`,
    );
    return;
  }

  console.error(
    `${logPrefix} after-send shop=${shop} outcome=failed code=${result.error?.code ?? "unknown"} message=${result.error?.message ?? "unknown"}`,
  );
}
