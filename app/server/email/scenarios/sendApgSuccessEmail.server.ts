import type { EmailServiceDeps } from "../services/emailService.server";
import {
  sendTemplateEmail,
  EMAIL_SUBJECTS,
  EMAIL_TEMPLATE_IDS,
} from "../services/emailService.server";

const LOG = "[Email][ApgSuccess]";

export type SendApgSuccessEmailParams = {
  to: string;
  taskType: string;
  username: string;
  productCount: number;
  /** 任务耗时（秒），对齐 Java Duration.between */
  durationSeconds: number;
  creditUsed?: number;
  creditRemaining?: number;
  startedAtMs?: number;
};

function formatUsNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function resolveDurationSeconds(params: SendApgSuccessEmailParams): number {
  if (params.startedAtMs != null && params.startedAtMs > 0) {
    return Math.max(
      0,
      Math.floor((Date.now() - params.startedAtMs) / 1000),
    );
  }
  return Math.max(0, Math.floor(params.durationSeconds));
}

/**
 * 对齐 Java TencentEmailService.sendAPGSuccessEmail（templateId 144209）。
 */
export async function sendApgSuccessEmail(
  params: SendApgSuccessEmailParams,
  deps: EmailServiceDeps = {},
) {
  const duration = resolveDurationSeconds(params);
  const templateData: Record<string, string> = {
    task_type: params.taskType,
    username: params.username,
    product_count: String(params.productCount),
    duration: String(duration),
    credit_used: formatUsNumber(params.creditUsed ?? 0),
    credit_remaining: formatUsNumber(params.creditRemaining ?? 0),
  };

  console.info(
    `${LOG} sending templateId=${EMAIL_TEMPLATE_IDS.APG_GENERATE_SUCCESS} to=${params.to} productCount=${params.productCount}`,
  );

  return sendTemplateEmail(
    {
      templateId: EMAIL_TEMPLATE_IDS.APG_GENERATE_SUCCESS,
      subject: EMAIL_SUBJECTS.APG_GENERATE_SUCCESS,
      to: params.to,
      templateData,
    },
    deps,
  );
}
