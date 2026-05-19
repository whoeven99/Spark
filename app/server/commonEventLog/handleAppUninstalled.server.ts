import { getAppEntry, getSessionPrismaTableName } from "../../config/appEntry.server";
import { appendCommonEventLog } from "./appendCommonEventLog.server";
import { fetchPartnerUninstallFeedback } from "./fetchPartnerUninstallFeedback.server";
import {
  mergeUninstallFeedback,
  parseUninstallFeedbackFromHeaders,
  parseUninstallFeedbackFromPayload,
  uninstallFeedbackToMetadata,
} from "./parseUninstallFeedback.server";
import { deleteSessionsForShop } from "./sessionTable.server";
import { COMMON_EVENT_TYPE } from "./types.server";

export async function handleAppUninstalled(params: {
  shop: string;
  topic: string;
  payload: unknown;
  sessionId?: string;
  webhookHeaders?: Headers;
}): Promise<void> {
  const shop = params.shop.trim();
  if (!shop) return;

  const appName = getAppEntry();
  const referenceId = params.sessionId
    ? `uninstall:${params.sessionId}`
    : `uninstall:${shop}:${appName}:${Date.now()}`;

  const feedbackFromPayload = parseUninstallFeedbackFromPayload(params.payload);
  const feedbackFromHeaders = params.webhookHeaders
    ? parseUninstallFeedbackFromHeaders(params.webhookHeaders)
    : null;

  let feedback = mergeUninstallFeedback(feedbackFromPayload, feedbackFromHeaders);

  if (!feedback?.reason && !feedback?.description) {
    feedback = mergeUninstallFeedback(
      feedback,
      await fetchPartnerUninstallFeedback({ shop }),
    );
  }

  if (feedback) {
    console.info(
      `[CommonEvent] uninstall feedback shop=${shop} source=${feedback.source} reason=${feedback.reason ?? "(none)"}`,
    );
  } else {
    console.info(
      `[CommonEvent] uninstall feedback shop=${shop} not found in webhook or Partner API`,
    );
  }

  await appendCommonEventLog({
    shop,
    appName,
    eventType: COMMON_EVENT_TYPE.APP_UNINSTALLED,
    topic: params.topic,
    referenceId,
    payload:
      params.payload && typeof params.payload === "object"
        ? (params.payload as Record<string, unknown>)
        : { raw: params.payload },
    metadata: uninstallFeedbackToMetadata(feedback),
  });

  await deleteSessionsForShop(shop, getSessionPrismaTableName());
}
