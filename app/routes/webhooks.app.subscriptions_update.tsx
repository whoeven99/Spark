import type { ActionFunctionArgs } from "react-router";
import { handleAppSubscriptionWebhook } from "../server/billing/index.server";
import { runWebhookWorkInBackground } from "../server/webhook/runWebhookWork.server";
import { runShopifyWebhookAction } from "../server/webhook/runShopifyWebhookAction.server";
import { unauthenticated } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  return runShopifyWebhookAction(request, async ({ shop, topic, payload }) => {
    runWebhookWorkInBackground(
      (async () => {
        const { admin } = await unauthenticated.admin(shop);
        await handleAppSubscriptionWebhook({
          shop,
          payload,
          admin,
        });
      })(),
      { shop, topic, label: "app_subscriptions/update" },
    );
  });
};
