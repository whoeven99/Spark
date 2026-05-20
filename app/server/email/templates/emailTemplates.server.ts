/** 对齐 Spring MailChimpConstants / TencentEmailService 模板 ID 与主题。 */

export const TENCENT_FROM_EMAIL = "support@msg.ciwi.ai";

export const EMAIL_SUBJECTS = {
  FIRST_INSTALL:
    "Welcome to Ciwi-Translator! Unlock a New Language Translation Experience",
  SUCCESSFUL_TRANSLATION:
    "Your Shopify Translation is Complete!｜Ciwi-translator",
  SUCCESSFUL_AUTO_TRANSLATION:
    "Ciwi.ai:Automatic translation completed｜Ciwi-translator",
  TRANSLATION_FAILED:
    "Your Shopify Translation Task Could Not Be Completed｜Ciwi-translator",
  SUBSCRIBE_SUCCESSFUL: "Your Credits Have Been Added!｜Ciwi-translator",
  CHARACTER_PURCHASE_SUCCESSFUL:
    "Confirmation of Successful Credits Purchase｜Ciwi-translator",
  PLAN_UPGRADE_SUCCESSFUL: "Plan Upgrade Successful!｜Ciwi-translator",
  PLAN_TRIALS_SUCCESSFUL: "You're now on your 5-day free trial｜Ciwi-translator",
  APG_INIT:
    "Create High-Converting Product Descriptions in 10 Seconds | Ciwi.ai-Product Content",
  APG_PURCHASE_EMAIL:
    "Confirmation of Successful Credits Purchase｜Ciwi.ai:Product Description",
  APG_TASK_INTERRUPT:
    "Your Product Content Task Could Not Be Completed｜Ciwi.ai:Product Description",
} as const;

export const EMAIL_TEMPLATE_IDS = {
  FIRST_INSTALL: 137916,
  TRANSLATION_SUCCESS: 137353,
  TRANSLATION_FAILED: 137317,
  AUTO_TRANSLATION_SUCCESS: 140352,
  CHARACTER_PURCHASE: 138372,
  PLAN_TRIAL: 146220,
  PLAN_UPGRADE: 139251,
  PLAN_UPGRADE_ALT: 146081,
  IP_RUNNING_OUT: 141470,
  IP_OUT: 141471,
  SUBSCRIBE_SUCCESS: 143058,
  APG_INIT: 144208,
  APG_PURCHASE: 144922,
  APG_TASK_INTERRUPT: 144923,
  IP_REPORT: 156623,
} as const;
