import {
  isEmailSendReady,
  loadEmailConfig,
} from "./config/emailConfig.server";
import { maskEmail } from "./emailLog.server";
import {
  buildSendEmailResultLog,
  buildTemplateEmailParamsLog,
} from "./emailSendLogPayload.server";
import { resolveOpsNotifyEmail } from "./opsNotifyEmail.server";
import type { SendEmailResult } from "./types/sendEmailResult";

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
      tencentRegion: config.tencent?.region ?? null,
      tencentFromEmail: config.tencent?.fromEmail
        ? maskEmail(config.tencent.fromEmail)
        : null,
      sendTimeoutMs: config.sendTimeoutMs,
      maxRetries: config.maxRetries,
      opsNotifyRecipient: recipient ? maskEmail(recipient) : null,
    })}`,
  );
}

export function logEmailOpsBeforeSend(
  logPrefix: string,
  context: Record<string, string | number | boolean | null | undefined>,
  sendParams: Parameters<typeof buildTemplateEmailParamsLog>[0],
): void {
  console.info(
    `${logPrefix} before-send ${JSON.stringify({
      ...context,
      ...buildTemplateEmailParamsLog(sendParams),
    })}`,
  );
}

export function logEmailOpsAfterSend(
  logPrefix: string,
  shop: string,
  result: SendEmailResult | { ok: false; skipped: true; reason: string },
  extra?: Record<string, unknown>,
): void {
  const payload = buildSendEmailResultLog(result, {
    shop,
    elapsedMs: extra?.elapsedMs,
    ...extra,
  });

  if ("skipped" in result && result.skipped) {
    console.info(`${logPrefix} after-send ${JSON.stringify(payload)}`);
    return;
  }

  if (result.ok) {
    console.info(`${logPrefix} after-send ${JSON.stringify(payload)}`);
    return;
  }

  console.error(`${logPrefix} after-send ${JSON.stringify(payload)}`);
}
