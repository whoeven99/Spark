import type { EmailServiceDeps } from "../services/emailService.server";
import { sendTemplateEmail } from "../services/emailService.server";
import { resolveOpsEmailDestination } from "../opsNotifyEmail.server";
import type { OpsEmailSessionSnapshot } from "../opsNotifyEmail.server";
import {
  logEmailOpsAfterSend,
  logEmailOpsPreflight,
} from "../emailOpsDebugLog.server";
import { buildNotificationDashboardUrl } from "../../notifications/buildNotificationDashboardUrl.server";
import { buildNotificationTemplateData } from "../../notifications/buildNotificationTemplateData.server";
import { getNotificationAppConfig } from "../../notifications/config";
import type { MerchantNotificationEvent } from "../../notifications/merchantNotificationEvents";
import { resolveNotificationTemplateId } from "../../notifications/notificationTemplateIds.server";
import { renderNotificationEmail } from "../../notifications/renderNotification";
import type {
  NotificationVariablesByEvent,
} from "../../notifications/types";

const LOG = "[Email][Notification]";
const DEFAULT_LOCALE = "zh-CN" as const;

export type SendNotificationEmailParams<E extends MerchantNotificationEvent> = {
  event: E;
  shop: string;
  appKey: string;
  variables: NotificationVariablesByEvent[E];
  sessionSnapshot?: OpsEmailSessionSnapshot | null;
};

export async function sendNotificationEmail<E extends MerchantNotificationEvent>(
  params: SendNotificationEmailParams<E>,
  deps: EmailServiceDeps = {},
) {
  const templateId = resolveNotificationTemplateId(params.event);
  const appConfig = getNotificationAppConfig(params.appKey);

  logEmailOpsPreflight(LOG, {
    shop: params.shop,
    appKey: params.appKey,
    event: params.event,
    templateId,
    sendMode: "tencent_template",
  });

  const to = resolveOpsEmailDestination(params.sessionSnapshot);
  if (!to) {
    const skipped = {
      ok: false as const,
      skipped: true as const,
      reason: "no_recipient",
    };
    logEmailOpsAfterSend(LOG, params.shop, skipped);
    return skipped;
  }

  const dashboardUrl = buildNotificationDashboardUrl(params.shop, params.appKey);
  const enrichedVariables = {
    ...params.variables,
    appName: params.variables.appName ?? appConfig.appName,
    brandName: params.variables.brandName ?? appConfig.brandName,
    supportEmail: params.variables.supportEmail ?? appConfig.supportEmail,
    dashboardUrl: params.variables.dashboardUrl ?? dashboardUrl,
    helpCenterUrl: params.variables.helpCenterUrl ?? appConfig.helpCenterUrl,
    appIconUrl: params.variables.appIconUrl ?? appConfig.appIconUrl,
  };

  const templateData = buildNotificationTemplateData(appConfig, enrichedVariables);
  const rendered = renderNotificationEmail({
    event: params.event,
    appConfig,
    variables: enrichedVariables,
    locale: DEFAULT_LOCALE,
  });

  const result = await sendTemplateEmail(
    {
      templateId,
      subject: rendered.subject,
      to,
      templateData,
    },
    deps,
  );

  logEmailOpsAfterSend(LOG, params.shop, result);
  return result;
}
