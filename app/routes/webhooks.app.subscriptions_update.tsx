import type { ActionFunctionArgs } from "react-router";
import { handleAppSubscriptionWebhook } from "../server/billing/index.server";
import { runWebhookWorkInBackground } from "../server/webhook/runWebhookWork.server";
import {
  authenticateWebhookLogged,
  returnWebhookOk,
} from "../server/webhook/webhookDebugLog.server";
import { unauthenticated } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticateWebhookLogged(request);

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

  return returnWebhookOk({ shop, topic });
};
