export { loadEmailConfig, isEmailSendReady } from "./config/emailConfig.server";
export type { EmailConfig } from "./config/emailConfig.server";
export {
  sendTemplateEmail,
  EMAIL_SUBJECTS,
  EMAIL_TEMPLATE_IDS,
  TENCENT_FROM_EMAIL,
} from "./services/emailService.server";
export type {
  SendTemplateEmailParams,
  EmailServiceDeps,
} from "./services/emailService.server";
export { sendApgSuccessEmail } from "./scenarios/sendApgSuccessEmail.server";
export type { SendApgSuccessEmailParams } from "./scenarios/sendApgSuccessEmail.server";
export { sendInstallOpsEmail } from "./scenarios/sendInstallOpsEmail.server";
export type { SendInstallOpsEmailParams } from "./scenarios/sendInstallOpsEmail.server";
export { sendUninstallOpsEmail } from "./scenarios/sendUninstallOpsEmail.server";
export type { SendUninstallOpsEmailParams } from "./scenarios/sendUninstallOpsEmail.server";
export {
  resolveOpsEmailDestination,
  resolveOpsNotifyEmail,
  resolveOpsUninstallTemplateId,
} from "./opsNotifyEmail.server";
export { fetchShopContactEmail } from "./shopEmailFetcher.server";
export type { EmailError, EmailErrorCode } from "./types/emailError";
export { EMAIL_ERROR_CODES } from "./types/emailError";
export type { SendEmailResult } from "./types/sendEmailResult";
