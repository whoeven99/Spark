import type { ActionFunctionArgs } from "react-router";
import { getAppEntry } from "../config/appEntry.server";
import { handleAppSubscriptionWebhook } from "../server/billing/index.server";
import { runWebhookWorkInBackground } from "../server/webhook/runWebhookWork.server";
import {
  authenticateWebhookLogged,
  returnWebhookOk,
} from "../server/webhook/webhookDebugLog.server";
import { unauthenticated } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticateWebhookLogged(request);
  const appName = getAppEntry();

  runWebhookWorkInBackground(
    (async () => {
      const { admin } = await unauthenticated.admin(shop);
      await handleAppSubscriptionWebhook({
        shop,
        payload,
        admin,
        appName,
      });
    })(),
    { shop, topic, label: "app_subscriptions/update" },
  );

  return returnWebhookOk({ shop, topic });
};
