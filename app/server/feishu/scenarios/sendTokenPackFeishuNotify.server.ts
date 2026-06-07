import { isBillingEnabled } from "../../billing/constants.server";
import { getPlanByKey } from "../../billing/plans/planCatalog.server";
import {
  formatOpsNotifyPrice,
  formatOpsNotifyTime,
} from "../feishuMessageFormat.server";
import { sendFeishuTextMessage } from "../sendFeishuTextMessage.server";
import type { SendFeishuResult } from "../feishuTypes.server";

const LOG = "[Feishu][TokenPackOps]";

export type SendTokenPackFeishuNotifyParams = {
  shop: string;
  appName: string;
  planKey: string;
};

export function buildTokenPackMessage(
  params: SendTokenPackFeishuNotifyParams,
  plan: {
    displayName: string;
    priceAmount: string;
    currencyCode: string;
    tokens: number;
  },
): string {
  return [
    "按量购包成功",
    "",
    `店铺: ${params.shop}`,
    `App: ${params.appName}`,
    `套餐: ${plan.displayName} (${params.planKey})`,
    `价格:  **${formatOpsNotifyPrice(plan.priceAmount, plan.currencyCode)}** `,
    `Token: ${plan.tokens}`,
    `时间: ${formatOpsNotifyTime()}`,
  ].join("\n");
}

export async function sendTokenPackFeishuNotify(
  params: SendTokenPackFeishuNotifyParams,
): Promise<SendFeishuResult> {
  if (!isBillingEnabled()) {
    console.info(
      `${LOG} skipped shop=${params.shop} appName=${params.appName} reason=billing_not_enabled`,
    );
    return {
      ok: false,
      channel: "ops_subscription",
      skipped: true,
      reason: "billing_not_enabled",
    };
  }

  console.info(
    `${LOG} before-send shop=${params.shop} appName=${params.appName} planKey=${params.planKey}`,
  );

  try {
    const plan = await getPlanByKey(params.planKey);
    const message = buildTokenPackMessage(params, plan);
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
