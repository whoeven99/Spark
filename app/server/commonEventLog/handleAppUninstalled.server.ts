import { appendCommonEventLog } from "./appendCommonEventLog.server";
import { deleteSessionsForShop } from "./sessionTable.server";
import { COMMON_EVENT_TYPE } from "./types.server";

export function buildUninstallEventReferenceId(params: {
  shop: string;
  webhookId?: string;
  sessionId?: string;
}): string {
  if (params.webhookId) return `uninstall:webhook:${params.webhookId}`;
  if (params.sessionId) return `uninstall:${params.sessionId}`;
  return `uninstall:${params.shop}:${Date.now()}`;
}

export async function handleAppUninstalled(params: {
  shop: string;
  topic: string;
  payload: unknown;
  sessionId?: string;
  webhookId?: string;
}): Promise<void> {
  const shop = params.shop.trim();
  if (!shop) return;

  const referenceId = buildUninstallEventReferenceId({
    shop,
    webhookId: params.webhookId,
    sessionId: params.sessionId,
  });

  await appendCommonEventLog({
    shop,
    eventType: COMMON_EVENT_TYPE.APP_UNINSTALLED,
    topic: params.topic,
    referenceId,
    payload:
      params.payload && typeof params.payload === "object"
        ? (params.payload as Record<string, unknown>)
        : { raw: params.payload },
  });

  await deleteSessionsForShop(shop);
}
