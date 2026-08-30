import { appendCommonEventLog } from "./appendCommonEventLog.server";
import { COMMON_EVENT_TYPE } from "./types.server";

/** 卸载运营通知幂等键：同店只发一次，与 webhookId 无关。 */
export function buildUninstallNotifyReferenceId(shop: string): string {
  return `uninstall:notify:${shop.trim()}`;
}

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

  try {
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
  } catch (error) {
    console.error(
      `[CommonEvent] APP_UNINSTALLED log failed shop=${shop}; continuing`,
      error,
    );
  }

  // Session / 全店业务删除改由 archiveAndPurgeShopData（onAppUninstalled）统一处理。
}
