import { formatOpsNotifyTime } from "../feishuMessageFormat.server";
import { sendFeishuTextMessage } from "../sendFeishuTextMessage.server";
import type { SendFeishuResult } from "../feishuTypes.server";

const LOG = "[Feishu][PromoClaimOps]";

export type SendPromoClaimFeishuNotifyParams = {
  shop: string;
  appName: string;
  campaignId: string;
  tokensDelta: number;
  claimedAt: Date;
};

export function buildPromoClaimMessage(
  params: SendPromoClaimFeishuNotifyParams,
): string {
  return [
    "🎁 安装福利 Token 已自动发放",
    "",
    `店铺: ${params.shop}`,
    `App: ${params.appName}`,
    `活动: ${params.campaignId}`,
    `发放额度: ${params.tokensDelta.toLocaleString("en-US")} Token`,
    `时间: ${formatOpsNotifyTime(params.claimedAt)}`,
  ].join("\n");
}

/** 与卸载通知共用 ops_uninstall 通道（同一飞书群）。 */
export async function sendPromoClaimFeishuNotify(
  params: SendPromoClaimFeishuNotifyParams,
): Promise<SendFeishuResult> {
  console.info(
    `${LOG} before-send shop=${params.shop} campaignId=${params.campaignId} tokensDelta=${params.tokensDelta}`,
  );

  const result = await sendFeishuTextMessage({
    channel: "ops_uninstall",
    message: buildPromoClaimMessage(params),
  });

  console.info(
    `${LOG} after-send shop=${params.shop} ok=${result.ok} skipped=${"skipped" in result ? result.skipped : false}`,
  );

  return result;
}
