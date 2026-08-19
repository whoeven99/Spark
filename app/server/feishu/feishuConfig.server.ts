import type { FeishuChannel } from "./feishuTypes.server";

/** 所有运营通知统一走 SUPPORT Webhook；channel 仅用于日志/结果标识 */
export const CHANNEL_ENV: Record<FeishuChannel, string> = {
  ops_uninstall: "FEISHU_WEBHOOK_URL_SUPPORT",
  ops_subscription: "FEISHU_WEBHOOK_URL_SUPPORT",
  ops_support: "FEISHU_WEBHOOK_URL_SUPPORT",
};

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === "") return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return defaultValue;
}

export function isFeishuEnabled(): boolean {
  return parseBoolean(process.env.FEISHU_ENABLED, true);
}

export function resolveFeishuWebhookUrl(_channel: FeishuChannel): string | null {
  const url = process.env.FEISHU_WEBHOOK_URL_SUPPORT?.trim();
  return url && url.length > 0 ? url : null;
}

export function isFeishuChannelReady(channel: FeishuChannel): boolean {
  return isFeishuEnabled() && resolveFeishuWebhookUrl(channel) !== null;
}
