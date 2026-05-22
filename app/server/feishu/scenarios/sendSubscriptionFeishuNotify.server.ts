import { isBillingEnabledForApp } from "../../billing/constants.server";
import { getPlanByKey } from "../../billing/plans/planCatalog.server";
import { sendFeishuTextMessage } from "../sendFeishuTextMessage.server";
import type { SendFeishuResult } from "../feishuTypes.server";

const LOG = "[Feishu][SubscriptionOps]";

export type SendSubscriptionFeishuNotifyParams = {
  shop: string;
  appName: string;
  planKey: string;
  billingInterval: string;
};

function buildSubscriptionMessage(
  params: SendSubscriptionFeishuNotifyParams,
  plan: {
    displayName: string;
    priceAmount: string;
    currencyCode: string;
  },
): string {
  const at = new Date().toISOString();
  return [
    "🎉 用户订阅成功",
    "",
    `店铺: ${params.shop}`,
    `App: ${params.appName}`,
    `套餐: ${plan.displayName} (${params.planKey})`,
    `价格: ${plan.priceAmount} ${plan.currencyCode}`,
    `周期: ${params.billingInterval}`,
    `时间: ${at}`,
  ].join("\n");
}

export async function sendSubscriptionFeishuNotify(
  params: SendSubscriptionFeishuNotifyParams,
): Promise<SendFeishuResult> {
  if (!isBillingEnabledForApp(params.appName)) {
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
