import { appendCommonEventLog } from "./appendCommonEventLog.server";
import { COMMON_EVENT_TYPE } from "./types.server";

/**
 * 卸载飞书/邮件通知幂等键。
 * 优先绑 Shopify webhookId（同一次投递重试不重复通知）；
 * 无 webhookId 时退化为短时戳，避免 `uninstall:notify:{shop}` 永久占坑导致再卸无通知。
 */
export function buildUninstallNotifyReferenceId(
  shop: string,
  webhookId?: string,
): string {
  const normalized = shop.trim();
  const id = webhookId?.trim();
  if (id) return `uninstall:notify:webhook:${id}`;
  return `uninstall:notify:${normalized}:${Date.now()}`;
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
