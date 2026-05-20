import type { EmailServiceDeps } from "../services/emailService.server";
import { sendTemplateEmail } from "../services/emailService.server";
import {
  resolveOpsEmailDestination,
  resolveOpsUninstallTemplateId,
} from "../opsNotifyEmail.server";
import { buildUninstallOpsTemplateData } from "../templates/uninstallOpsTemplateData.server";
import type { UninstallSessionSnapshot } from "../../commonEventLog/loadSessionSnapshotForUninstall.server";
import {
  logEmailOpsAfterSend,
  logEmailOpsPreflight,
} from "../emailOpsDebugLog.server";

const LOG = "[Email][UninstallOps]";

export const OPS_UNINSTALL_EMAIL_SUBJECT = "Shopify App Uninstalled";

export type SendUninstallOpsEmailParams = {
  shop: string;
  appName: string;
  uninstalledAt: Date;
  installDurationMs?: number | null;
  sessionSnapshot?: UninstallSessionSnapshot | null;
};

export async function sendUninstallOpsEmail(
  params: SendUninstallOpsEmailParams,
  deps: EmailServiceDeps = {},
) {
  console.info(
    `${LOG} before-send shop=${params.shop} appName=${params.appName} uninstalledAt=${params.uninstalledAt.toISOString()} installDurationMs=${params.installDurationMs ?? "null"} hasSessionSnapshot=${Boolean(params.sessionSnapshot)}`,
  );

  logEmailOpsPreflight(LOG, {
    shop: params.shop,
    appName: params.appName,
    flow: "uninstall",
  });

  const templateId = resolveOpsUninstallTemplateId();
  if (templateId == null) {
    const skipped = {
      ok: false as const,
      skipped: true as const,
      reason: "no_template_id",
    };
    logEmailOpsAfterSend(LOG, params.shop, skipped);
    return skipped;
  }

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

  console.info(
    `${LOG} destination shop=${params.shop} to=${to} source=${params.sessionSnapshot?.email?.trim() ? "session" : "ops_fallback"}`,
  );

  const templateData = buildUninstallOpsTemplateData({
    shop: params.shop,
    appName: params.appName,
    uninstalledAt: params.uninstalledAt,
    installDurationMs: params.installDurationMs,
    sessionSnapshot: params.sessionSnapshot,
  });

  console.info(
    `${LOG} invoking sendTemplateEmail templateId=${templateId} shop=${params.shop} templateKeys=${Object.keys(templateData).join(",")}`,
  );

  const result = await sendTemplateEmail(
    {
      templateId,
      subject: OPS_UNINSTALL_EMAIL_SUBJECT,
      to,
      templateData,
    },
    deps,
  );

  logEmailOpsAfterSend(LOG, params.shop, result);
  return result;
}
