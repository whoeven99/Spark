import type { EmailConfig } from "../config/emailConfig.server";
import { isEmailSendReady, loadEmailConfig } from "../config/emailConfig.server";
import { EMAIL_LOG, logEmailError, logEmailInfo } from "../emailLog.server";
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
  EMAIL_SUBJECTS,
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
  if (from?.trim()) return from.trim();
  return config.tencent?.fromEmail ?? TENCENT_FROM_EMAIL;
}

/**
 * 发送腾讯 SES 模板邮件。业务代码应调用此函数，禁止直接使用 Provider。
 */
export async function sendTemplateEmail(
  params: SendTemplateEmailParams,
  deps: EmailServiceDeps = {},
): Promise<SendEmailResult> {
  const config = deps.config ?? loadEmailConfig();

  logEmailInfo(
    EMAIL_LOG.service,
    `sendTemplateEmail start templateId=${params.templateId} to=${params.to}`,
  );

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

  const parsed = sendEmailRequestSchema.safeParse({
    templateId: params.templateId,
    templateData: params.templateData ?? {},
    subject: params.subject,
    from: resolveFrom(params.from, config),
    to: params.to,
    cc: params.cc,
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
    const result = await provider.send(parsed.data as SendEmailRequest);
    if (result.ok) {
      logEmailInfo(
        EMAIL_LOG.service,
        `sendTemplateEmail ok requestId=${result.requestId} provider=${result.provider}`,
      );
    } else {
      logEmailError(
        EMAIL_LOG.service,
        "sendTemplateEmail provider error",
        result.error,
      );
    }
    return result;
  } catch (error) {
    logEmailError(EMAIL_LOG.service, "sendTemplateEmail unexpected", error);
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
  EMAIL_SUBJECTS,
  EMAIL_TEMPLATE_IDS,
  TENCENT_FROM_EMAIL,
};
