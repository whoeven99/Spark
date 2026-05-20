import type { EmailServiceDeps } from "../services/emailService.server";
import {
  sendTemplateEmail,
  EMAIL_TEMPLATE_IDS,
} from "../services/emailService.server";
import { resolveOpsEmailDestination } from "../opsNotifyEmail.server";
import { buildInstallOpsTemplateData } from "../templates/installOpsTemplateData.server";
import type { UninstallSessionSnapshot } from "../../commonEventLog/loadSessionSnapshotForUninstall.server";
import type { ShopBasicInfo } from "../../shopify/fetchShopBasicInfo.server";
import {
  logEmailOpsAfterSend,
  logEmailOpsPreflight,
} from "../emailOpsDebugLog.server";

const LOG = "[Email][InstallOps]";

export const OPS_INSTALL_EMAIL_SUBJECT = "New Shopify App Installed";

export type SendInstallOpsEmailParams = {
  shop: string;
  appName: string;
  source?: string;
  installedAt: Date;
  shopInfo?: ShopBasicInfo | null;
  sessionSnapshot?: UninstallSessionSnapshot | null;
};

export async function sendInstallOpsEmail(
  params: SendInstallOpsEmailParams,
  deps: EmailServiceDeps = {},
) {
  console.info(
    `${LOG} before-send shop=${params.shop} appName=${params.appName} source=${params.source ?? "unknown"} installedAt=${params.installedAt.toISOString()} hasShopInfo=${Boolean(params.shopInfo)}`,
  );

  logEmailOpsPreflight(LOG, {
    shop: params.shop,
    appName: params.appName,
    templateId: EMAIL_TEMPLATE_IDS.FIRST_INSTALL,
    flow: "install",
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

  console.info(
    `${LOG} destination shop=${params.shop} to=${to} source=${params.sessionSnapshot?.email?.trim() ? "session" : "ops_fallback"}`,
  );

  const templateData = buildInstallOpsTemplateData({
    shop: params.shop,
    appName: params.appName,
    source: params.source,
    installedAt: params.installedAt,
    shopInfo: params.shopInfo,
    sessionSnapshot: params.sessionSnapshot,
  });

  console.info(
    `${LOG} invoking sendTemplateEmail templateId=${EMAIL_TEMPLATE_IDS.FIRST_INSTALL} shop=${params.shop} templateKeys=${Object.keys(templateData).join(",")}`,
  );

  const result = await sendTemplateEmail(
    {
      templateId: EMAIL_TEMPLATE_IDS.FIRST_INSTALL,
      subject: OPS_INSTALL_EMAIL_SUBJECT,
      to,
      templateData,
    },
    deps,
  );

  logEmailOpsAfterSend(LOG, params.shop, result);
  return result;
}
