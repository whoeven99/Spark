import type { EmailConfig } from "../config/emailConfig.server";
import {
  isEmailSendReady,
  loadEmailConfig,
  resolveTencentSesFromEmail,
} from "../config/emailConfig.server";
import { EMAIL_LOG } from "../emailLog.server";
import { getEmailProvider } from "../providers/providerFactory.server";
import type { EmailProvider } from "../providers/emailProvider";
import {
  createEmailError,
  EMAIL_ERROR_CODES,
} from "../types/emailError";
import {
  sendEmailRequestSchema,
  type SendEmailRequest,
} from "../types/sendEmailRequest";
import type { SendEmailResult } from "../types/sendEmailResult";
import {
  applyEmailTestRecipientOverride,
  logEmailTestRecipientOverride,
} from "../emailTestRecipient.server";
import {
  EMAIL_TEMPLATE_IDS,
  TENCENT_FROM_EMAIL,
} from "../templates/emailTemplates.server";

export type SendTemplateEmailParams = {
  templateId: number;
  templateData?: Record<string, string>;
  subject: string;
  to: string;
  from?: string;
  cc?: string[];
};

export type EmailServiceDeps = {
  config?: EmailConfig;
  provider?: EmailProvider | null;
};

function resolveFrom(
  from: string | undefined,
  config: EmailConfig,
): string {
  return resolveTencentSesFromEmail(from ?? config.tencent?.fromEmail);
}

/**
 * 发送腾讯 SES 模板邮件。业务代码应调用此函数，禁止直接使用 Provider。
 */
export async function sendTemplateEmail(
  params: SendTemplateEmailParams,
  deps: EmailServiceDeps = {},
): Promise<SendEmailResult> {
  const config = deps.config ?? loadEmailConfig();

  if (!config.enabled) {
    return {
      ok: false,
      error: createEmailError({
        code: EMAIL_ERROR_CODES.EMAIL_DISABLED,
        message: "Email sending is disabled (EMAIL_ENABLED=false)",
        provider: config.provider,
      }),
    };
  }

  if (!isEmailSendReady(config)) {
    return {
      ok: false,
      error: createEmailError({
        code: EMAIL_ERROR_CODES.MISSING_CREDENTIALS,
        message: "Email credentials are not configured",
        provider: config.provider,
      }),
    };
  }

  const routed = applyEmailTestRecipientOverride({
    templateId: params.templateId,
    templateData: params.templateData ?? {},
    subject: params.subject,
    from: resolveFrom(params.from, config),
    to: params.to,
    cc: params.cc,
  });
  logEmailTestRecipientOverride(EMAIL_LOG.service, routed.originalTo);

  const parsed = sendEmailRequestSchema.safeParse({
    templateId: routed.templateId,
    templateData: routed.templateData,
    subject: routed.subject,
    from: routed.from,
    to: routed.to,
    cc: routed.cc,
  });

  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join("；");
    return {
      ok: false,
      error: createEmailError({
        code: EMAIL_ERROR_CODES.VALIDATION_FAILED,
        message,
        provider: config.provider,
      }),
    };
  }

  const provider =
    deps.provider !== undefined ? deps.provider : getEmailProvider(config);

  if (!provider) {
    return {
      ok: false,
      error: createEmailError({
        code: EMAIL_ERROR_CODES.PROVIDER_NOT_FOUND,
        message: `Unsupported email provider: ${config.provider}`,
        provider: config.provider,
      }),
    };
  }

  try {
    return await provider.send(parsed.data as SendEmailRequest);
  } catch (error) {
    return {
      ok: false,
      error: createEmailError({
        code: EMAIL_ERROR_CODES.UNKNOWN,
        message: error instanceof Error ? error.message : "Unknown email error",
        provider: config.provider,
        cause: error,
      }),
    };
  }
}

export {
  EMAIL_TEMPLATE_IDS,
  TENCENT_FROM_EMAIL,
};
