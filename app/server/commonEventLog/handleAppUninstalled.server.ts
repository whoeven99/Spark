import { getAppEntry, getSessionPrismaTableName } from "../../config/appEntry.server";
import { appendCommonEventLog } from "./appendCommonEventLog.server";
import { deleteSessionsForShop } from "./sessionTable.server";
import { COMMON_EVENT_TYPE } from "./types.server";

export async function handleAppUninstalled(params: {
  shop: string;
  topic: string;
  payload: unknown;
  sessionId?: string;
}): Promise<void> {
  const shop = params.shop.trim();
  if (!shop) return;

  const appName = getAppEntry();
  const referenceId = params.sessionId
    ? `uninstall:${params.sessionId}`
    : `uninstall:${shop}:${appName}:${Date.now()}`;

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
  });

  await deleteSessionsForShop(shop, getSessionPrismaTableName());
}
