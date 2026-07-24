import type { FeishuChannel } from "./feishuTypes.server";

/** channel → 环境变量名（各场景独立 Webhook，无全局 fallback） */
export const CHANNEL_ENV: Record<FeishuChannel, string> = {
  ops_uninstall: "FEISHU_WEBHOOK_URL_UNINSTALL",
  ops_subscription: "FEISHU_WEBHOOK_URL_SUBSCRIPTION",
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

export function resolveFeishuWebhookUrl(channel: FeishuChannel): string | null {
  const envKey = CHANNEL_ENV[channel];
  const url = process.env[envKey]?.trim();
  return url && url.length > 0 ? url : null;
}

export function isFeishuChannelReady(channel: FeishuChannel): boolean {
  return isFeishuEnabled() && resolveFeishuWebhookUrl(channel) !== null;
}
