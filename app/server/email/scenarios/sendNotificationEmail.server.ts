import type { EmailServiceDeps } from "../services/emailService.server";
import { sendTemplateEmail } from "../services/emailService.server";
import { resolveOpsEmailDestination } from "../opsNotifyEmail.server";
import type { OpsEmailSessionSnapshot } from "../opsNotifyEmail.server";
import {
  logEmailOpsAfterSend,
  logEmailOpsBeforeSend,
  logEmailOpsPreflight,
} from "../emailOpsDebugLog.server";
import { maskEmail } from "../emailLog.server";
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
  const startedAt = Date.now();
  const templateId = resolveNotificationTemplateId(params.event);
  const appConfig = getNotificationAppConfig(params.appKey);

  logEmailOpsPreflight(LOG, {
    shop: params.shop,
    appKey: params.appKey,
    event: params.event,
    templateId,
    sendMode: "tencent_template",
    sessionOwnerEmail: params.sessionSnapshot?.email
      ? maskEmail(params.sessionSnapshot.email)
      : null,
    variableKeys: Object.keys(params.variables),
  });

  const to = resolveOpsEmailDestination(params.sessionSnapshot);
  if (!to) {
    const skipped = {
      ok: false as const,
      skipped: true as const,
      reason: "no_recipient",
    };
    logEmailOpsAfterSend(LOG, params.shop, skipped, {
      elapsedMs: Date.now() - startedAt,
      event: params.event,
      templateId,
    });
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

  const sendParams = {
    templateId,
    subject: rendered.subject,
    to,
    templateData,
  };

  logEmailOpsBeforeSend(
    LOG,
    {
      shop: params.shop,
      appKey: params.appKey,
      event: params.event,
      recipientSource: params.sessionSnapshot?.email?.trim()
        ? "session_owner"
        : "ops_notify_fallback",
    },
    sendParams,
  );

  const result = await sendTemplateEmail(sendParams, deps);

  logEmailOpsAfterSend(LOG, params.shop, result, {
    elapsedMs: Date.now() - startedAt,
    event: params.event,
    templateId,
    appKey: params.appKey,
  });
  return result;
}
