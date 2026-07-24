import { isBillingEnabled } from "../../billing/constants.server";
import { getPlanByKey } from "../../billing/plans/planCatalog.server";
import {
  formatOpsNotifyPrice,
  formatOpsNotifyTime,
} from "../feishuMessageFormat.server";
import { sendFeishuTextMessage } from "../sendFeishuTextMessage.server";
import type { SendFeishuResult } from "../feishuTypes.server";

const LOG = "[Feishu][SubscriptionOps]";

export type SendSubscriptionFeishuNotifyParams = {
  shop: string;
  planKey: string;
};

export function buildSubscriptionMessage(
  params: SendSubscriptionFeishuNotifyParams,
  plan: {
    displayName: string;
    priceAmount: string;
    currencyCode: string;
  },
): string {
  return [
    "🎉 用户订阅成功",
    "",
    `店铺: ${params.shop}`,
    `套餐: ${plan.displayName}`,
    `价格: ${formatOpsNotifyPrice(plan.priceAmount, plan.currencyCode)}`,
    `时间: ${formatOpsNotifyTime()}`,
  ].join("\n");
}

export async function sendSubscriptionFeishuNotify(
  params: SendSubscriptionFeishuNotifyParams,
): Promise<SendFeishuResult> {
  if (!isBillingEnabled()) {
    console.info(
      `${LOG} skipped shop=${params.shop} planKey=${params.planKey} reason=billing_not_enabled`,
    );
    return {
      ok: false,
      channel: "ops_subscription",
      skipped: true,
      reason: "billing_not_enabled",
    };
  }

  console.info(
    `${LOG} before-send shop=${params.shop} planKey=${params.planKey}`,
  );

  try {
    const plan = await getPlanByKey(params.planKey);
    const message = buildSubscriptionMessage(params, plan);
    const result = await sendFeishuTextMessage({
      channel: "ops_subscription",
      message,
    });

    console.info(
      `${LOG} after-send shop=${params.shop} ok=${result.ok} skipped=${"skipped" in result ? result.skipped : false}`,
    );

    return result;
  } catch (error) {
    console.error(`${LOG} failed shop=${params.shop}`, error);
    return { ok: false, channel: "ops_subscription", reason: "exception" };
  }
}
