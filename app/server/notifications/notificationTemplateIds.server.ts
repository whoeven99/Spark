import type { MerchantNotificationEvent } from "./merchantNotificationEvents";

/** 腾讯云 agent-*-zh 模板 ID（与控制台一致）。 */
export const NOTIFICATION_TEMPLATE_IDS = {
  appInstalled: 180498,
  appUninstalled: 180499,
  purchaseCreated: 180500,
  subscriptionCanceled: 180501,
  subscriptionChanged: 180502,
  subscriptionStarted: 180503,
} as const satisfies Record<MerchantNotificationEvent, number>;

const ENV_KEYS: Record<MerchantNotificationEvent, string> = {
  appInstalled: "NOTIFICATION_TEMPLATE_ID_APP_INSTALLED",
  appUninstalled: "NOTIFICATION_TEMPLATE_ID_APP_UNINSTALLED",
  purchaseCreated: "NOTIFICATION_TEMPLATE_ID_PURCHASE",
  subscriptionCanceled: "NOTIFICATION_TEMPLATE_ID_SUBSCRIPTION_CANCELED",
  subscriptionChanged: "NOTIFICATION_TEMPLATE_ID_SUBSCRIPTION_CHANGED",
  subscriptionStarted: "NOTIFICATION_TEMPLATE_ID_SUBSCRIPTION_STARTED",
};

function parseEnvTemplateId(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function resolveNotificationTemplateId(
  event: MerchantNotificationEvent,
): number {
  const fromEnv = parseEnvTemplateId(process.env[ENV_KEYS[event]]);
  return fromEnv ?? NOTIFICATION_TEMPLATE_IDS[event];
}
