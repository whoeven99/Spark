import { EMAIL_TEMPLATE_IDS } from "../../../email/templates/emailTemplates.server";

export const SEND_TEMPLATE_EMAIL_TOOL_NAME = "send_template_email";

export const SEND_TEMPLATE_EMAIL_LOG_PREFIX = "[EmailTool]";

/**
 * Agent 可发送的邮件场景注册表（单一事实源）。
 * key 为语义化场景名（喂给 LLM，无需感知数字 templateId）；
 * templateId 为腾讯 SES 模板 ID；description 用于在 schema/prompt 中向 LLM 说明用途。
 */
export const EMAIL_SCENARIOS = {
  app_install_success: {
    templateId: EMAIL_TEMPLATE_IDS.APP_INSTALL_SUCCESS,
    description: "应用安装成功通知",
  },
  app_uninstall: {
    templateId: EMAIL_TEMPLATE_IDS.APP_UNINSTALL,
    description: "应用被卸载通知",
  },
  order_pay_success: {
    templateId: EMAIL_TEMPLATE_IDS.ORDER_PAY_SUCCESS,
    description: "订单/一次性付款成功通知",
  },
  subscription_success: {
    templateId: EMAIL_TEMPLATE_IDS.SUBSCRIPTION_SUCCESS,
    description: "订阅开通/续费成功通知",
  },
  subscription_updated: {
    templateId: EMAIL_TEMPLATE_IDS.SUBSCRIPTION_UPDATED,
    description: "订阅变更（升/降级）通知",
  },
  subscription_cancelled: {
    templateId: EMAIL_TEMPLATE_IDS.SUBSCRIPTION_CANCELLED,
    description: "订阅取消通知",
  },
  task_started: {
    templateId: EMAIL_TEMPLATE_IDS.TASK_STARTED,
    description: "任务开始通知",
  },
  task_completed: {
    templateId: EMAIL_TEMPLATE_IDS.TASK_COMPLETED,
    description: "任务完成通知",
  },
  task_paused: {
    templateId: EMAIL_TEMPLATE_IDS.TASK_PAUSED,
    description: "任务暂停通知",
  },
} as const;

export type EmailScenario = keyof typeof EMAIL_SCENARIOS;

/** z.enum 需要 [string, ...string[]] 形式的非空元组 */
export const EMAIL_SCENARIO_KEYS = Object.keys(EMAIL_SCENARIOS) as [
  EmailScenario,
  ...EmailScenario[],
];

export function resolveTemplateIdByScenario(scenario: EmailScenario): number {
  return EMAIL_SCENARIOS[scenario].templateId;
}

/** 供 schema/prompt 展示的「场景名 → 含义」清单 */
export function buildEmailScenarioCatalog(): string {
  return EMAIL_SCENARIO_KEYS.map(
    (key) => `${key}（${EMAIL_SCENARIOS[key].description}）`,
  ).join("、");
}

export const AGENT_EMAIL_ERROR_CODES = {
  INVALID_SCENARIO: "INVALID_SCENARIO",
  NO_RECIPIENT: "NO_RECIPIENT",
} as const;
