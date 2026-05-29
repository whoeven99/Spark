import { sendFeishuTextMessage } from "../sendFeishuTextMessage.server";
import type { SendFeishuResult } from "../feishuTypes.server";

const LOG = "[Feishu][UninstallOps]";

export type SendUninstallFeishuNotifyParams = {
  shop: string;
  appName: string;
  uninstalledAt: Date;
  uninstallReason?: string | null;
  uninstallFeedback?: string | null;
};

const FEEDBACK_MAX_LENGTH = 500;
const UNINSTALL_FIELD_FALLBACK = "（未提供）";

export function formatUninstallNotifyField(
  value: string | null | undefined,
  maxLength = FEEDBACK_MAX_LENGTH,
): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return UNINSTALL_FIELD_FALLBACK;
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}…`;
}

export function buildUninstallMessage(params: SendUninstallFeishuNotifyParams): string {
  return [
    "🚨 Shopify App 已卸载",
    "",
    `店铺: ${params.shop}`,
    `App: ${params.appName}`,
    `时间: ${params.uninstalledAt.toISOString()}`,
    `卸载原因: ${formatUninstallNotifyField(params.uninstallReason)}`,
    `用户反馈: ${formatUninstallNotifyField(params.uninstallFeedback)}`,
  ].join("\n");
}
export async function sendUninstallFeishuNotify(
  params: SendUninstallFeishuNotifyParams,
): Promise<SendFeishuResult> {
  console.info(
    `${LOG} before-send shop=${params.shop} appName=${params.appName} uninstalledAt=${params.uninstalledAt.toISOString()}`,
  );

  const message = buildUninstallMessage(params);
  const result = await sendFeishuTextMessage({
    channel: "ops_uninstall",
    message,
  });

  console.info(
    `${LOG} after-send shop=${params.shop} ok=${result.ok} skipped=${"skipped" in result ? result.skipped : false}`,
  );

  return result;
}
