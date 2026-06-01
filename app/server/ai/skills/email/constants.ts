import { EMAIL_TEMPLATE_IDS } from "../../../email/templates/emailTemplates.server";

export const SEND_TEMPLATE_EMAIL_TOOL_NAME = "send_template_email";

export const SEND_TEMPLATE_EMAIL_LOG_PREFIX = "[EmailTool]";

/** Agent 可发送的模板 ID */
export const AGENT_ALLOWED_TEMPLATE_IDS = [
  EMAIL_TEMPLATE_IDS.APP_INSTALL_SUCCESS,
  EMAIL_TEMPLATE_IDS.APP_UNINSTALL,
  EMAIL_TEMPLATE_IDS.ORDER_PAY_SUCCESS,
  EMAIL_TEMPLATE_IDS.SUBSCRIPTION_CANCELLED,
  EMAIL_TEMPLATE_IDS.SUBSCRIPTION_UPDATED,
  EMAIL_TEMPLATE_IDS.SUBSCRIPTION_SUCCESS,
  EMAIL_TEMPLATE_IDS.TASK_COMPLETED,
  EMAIL_TEMPLATE_IDS.TASK_PAUSED,
  EMAIL_TEMPLATE_IDS.TASK_STARTED,
] as const;

export type AgentAllowedTemplateId = (typeof AGENT_ALLOWED_TEMPLATE_IDS)[number];

export function isAgentAllowedTemplateId(templateId: number): templateId is AgentAllowedTemplateId {
  return (AGENT_ALLOWED_TEMPLATE_IDS as readonly number[]).includes(templateId);
}

export const AGENT_EMAIL_ERROR_CODES = {
  INVALID_TEMPLATE_ID: "INVALID_TEMPLATE_ID",
} as const;
