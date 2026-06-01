export { loadEmailConfig, isEmailSendReady } from "./config/emailConfig.server";
export type { EmailConfig } from "./config/emailConfig.server";
export {
  sendTemplateEmail,
  EMAIL_TEMPLATE_IDS,
  TENCENT_FROM_EMAIL,
} from "./services/emailService.server";
export type {
  SendTemplateEmailParams,
  EmailServiceDeps,
} from "./services/emailService.server";
export {
  resolveOpsEmailDestination,
  resolveOpsNotifyEmail,
} from "./opsNotifyEmail.server";
export type { EmailError, EmailErrorCode } from "./types/emailError";
export { EMAIL_ERROR_CODES } from "./types/emailError";
export type { SendEmailResult } from "./types/sendEmailResult";
