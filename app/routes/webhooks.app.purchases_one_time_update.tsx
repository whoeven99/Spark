import type { ActionFunctionArgs } from "react-router";
import { handleAppPurchaseOneTimeWebhook } from "../server/billing/index.server";
import { runWebhookWorkInBackground } from "../server/webhook/runWebhookWork.server";
import { runShopifyWebhookAction } from "../server/webhook/runShopifyWebhookAction.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  return runShopifyWebhookAction(request, async ({ shop, topic, payload }) => {
    runWebhookWorkInBackground(
      handleAppPurchaseOneTimeWebhook({
        shop,
        payload,
      }),
      { shop, topic, label: "app_purchases_one_time/update" },
    );
  });
};
