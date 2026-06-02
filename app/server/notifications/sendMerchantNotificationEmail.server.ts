import { isEmailSendReady, loadEmailConfig } from "../email/config/emailConfig.server";
import { maskEmail } from "../email/emailLog.server";
import {
  resolveOpsEmailDestination,
  type OpsEmailSessionSnapshot,
} from "../email/opsNotifyEmail.server";
import { TENCENT_FROM_EMAIL } from "../email/templates/emailTemplates.server";
import { sendTemplateEmail } from "../email/services/emailService.server";
import { buildNotificationDashboardUrl } from "./buildNotificationDashboardUrl.server";
import { buildNotificationTemplateData } from "./buildNotificationTemplateData.server";
import { getNotificationAppConfig } from "./config";
import { resolveNotificationLocale } from "./formatNotificationDisplay.server";
import type { MerchantNotificationEvent } from "./merchantNotificationEvents";
import { resolveNotificationTemplateId } from "./notificationTemplateIds.server";
import { renderNotificationEmail } from "./renderNotification";
import type { NotificationVariablesByEvent } from "./types";

const LOG = "[MerchantEmail]";

/**
 * 商户事务邮件统一派发器：事件 → 收件人/语言/模板/主题/变量 → 腾讯 SES。
 *
 * - 收件人由服务端解析（店主邮箱 / 运营兜底 / EMAIL_TEST_RECIPIENT 重定向），不接受外部指定。
 * - 主题复用 renderNotificationEmail（按 locale），正文由腾讯模板按 templateId 渲染。
 * - 内部吞掉所有异常，保证不影响调用方的业务主流程。
 */
export async function dispatchMerchantNotificationEmail<
  E extends MerchantNotificationEvent,
>(params: {
  event: E;
  shop: string;
  appName: string;
  variables: NotificationVariablesByEvent[E];
  recipient?: OpsEmailSessionSnapshot | null;
}): Promise<void> {
  const { event, shop, appName, variables } = params;

  const config = loadEmailConfig();
  if (!isEmailSendReady(config)) {
    console.info(
      `${LOG} skip event=${event} shop=${shop} reason=email-not-ready enabled=${config.enabled} provider=${config.provider} hasTencentCredentials=${config.tencent !== null}`,
    );
    return;
  }

  const to = resolveOpsEmailDestination(params.recipient ?? null);
  if (!to) {
    const ownerEmail = params.recipient?.email?.trim() || "(empty)";
    console.warn(
      `${LOG} skip event=${event} shop=${shop} reason=no-recipient sessionEmail=${ownerEmail} opsNotifyConfigured=${Boolean(process.env.OPS_NOTIFY_EMAIL?.trim())}`,
    );
    return;
  }

  const locale = resolveNotificationLocale(params.recipient?.locale);
  const baseConfig = getNotificationAppConfig(appName);
  const dashboardUrl = buildNotificationDashboardUrl(shop, baseConfig.appKey);
  const appConfig = dashboardUrl ? { ...baseConfig, dashboardUrl } : baseConfig;

  const subject = renderNotificationEmail({
    event,
    appConfig,
    variables,
    locale,
  }).subject;
  const templateData = buildNotificationTemplateData(appConfig, variables, locale);
  const templateId = resolveNotificationTemplateId(event, locale);

  const sendStartedAt = Date.now();

  try {
    const result = await sendTemplateEmail({
      to,
      subject,
      templateId,
      templateData,
      from: config.tencent?.fromEmail ?? TENCENT_FROM_EMAIL,
    });
    const elapsedMs = Date.now() - sendStartedAt;
    if (result.ok) {
      console.info(
        `${LOG} sent event=${event} shop=${shop} templateId=${templateId} requestId=${result.requestId} elapsedMs=${elapsedMs} to=${maskEmail(to)}`,
      );
    } else {
      console.error(
        `${LOG} failed event=${event} shop=${shop} templateId=${templateId} code=${result.error.code} message=${result.error.message} elapsedMs=${elapsedMs}`,
      );
    }
  } catch (error) {
    console.error(
      `${LOG} failed event=${event} shop=${shop} templateId=${templateId} unexpected=true elapsedMs=${Date.now() - sendStartedAt}:`,
      error,
    );
  }
}
