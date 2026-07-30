/** Tencent SES From address (msg subdomain). */
export const TENCENT_FROM_EMAIL = "support@msg.ciwi.ai";

/** Merchant-visible support inbox for template body/footer only — not SES From. */
export const MERCHANT_SUPPORT_EMAIL = "support@ciwi.ai";

/** Spark 未接入的 Java/Spring 遗留 templateId 已移除；商户事务邮件 ID 见 notificationTemplateIds.server.ts。 */
export const EMAIL_TEMPLATE_IDS = {
  /** Agent task_* 场景；商户自动邮件不在此表。 */
  TASK_COMPLETED: 180504,
  // TODO: 对照腾讯控制台确认 TASK_FAILED 与 TASK_PAUSED 是否应共用 180506
  TASK_PAUSED: 180506,
  TASK_FAILED: 180506,
  TASK_STARTED: 180507,
} as const;
