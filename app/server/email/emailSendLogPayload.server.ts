import { maskEmail, maskEmailList } from "./emailLog.server";
import type { SendEmailRequest } from "./types/sendEmailRequest";
import type { SendEmailResult } from "./types/sendEmailResult";

export type TemplateEmailParamsForLog = {
  templateId: number;
  templateData?: Record<string, string>;
  subject: string;
  to: string;
  from?: string;
  cc?: string[];
};

export function buildTemplateEmailParamsLog(
  params: TemplateEmailParamsForLog,
): Record<string, unknown> {
  const templateData = params.templateData ?? {};
  return {
    templateId: params.templateId,
    subject: params.subject,
    subjectLen: params.subject.length,
    to: maskEmail(params.to),
    from: params.from ? maskEmail(params.from) : undefined,
    cc: maskEmailList(params.cc),
    templateDataKeyCount: Object.keys(templateData).length,
    templateData,
  };
}

export function buildSendEmailRequestLog(
  request: SendEmailRequest,
): Record<string, unknown> {
  const templateData = request.templateData ?? {};
  return {
    templateId: request.templateId,
    subject: request.subject,
    subjectLen: request.subject.length,
    from: maskEmail(request.from),
    to: maskEmail(request.to),
    cc: maskEmailList(request.cc),
    templateDataKeyCount: Object.keys(templateData).length,
    templateData,
  };
}

export function buildSendEmailResultLog(
  result: SendEmailResult | { ok: false; skipped: true; reason: string },
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  if ("skipped" in result && result.skipped) {
    return {
      sendSuccess: false,
      outcome: "skipped",
      reason: result.reason,
      ...extra,
    };
  }

  if (result.ok) {
    return {
      sendSuccess: true,
      outcome: "success",
      requestId: result.requestId,
      provider: result.provider,
      ...extra,
    };
  }

  return {
    sendSuccess: false,
    outcome: "failed",
    errorCode: result.error.code,
    errorMessage: result.error.message,
    provider: result.error.provider,
    ...extra,
  };
}
