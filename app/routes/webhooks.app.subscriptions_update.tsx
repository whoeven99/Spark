import type { ActionFunctionArgs } from "react-router";
import { getAppEntry } from "../config/appEntry.server";
import { handleAppSubscriptionWebhook } from "../server/billing/index.server";
import {
  authenticateWebhookLogged,
  returnWebhookOk,
} from "../server/webhook/webhookDebugLog.server";
import { unauthenticated } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticateWebhookLogged(request);

  try {
    const { admin } = await unauthenticated.admin(shop);
    await handleAppSubscriptionWebhook({
      shop,
      payload,
      admin,
      appName: getAppEntry(),
    });
  } catch (error) {
    console.error("[Billing] app_subscriptions/update handler failed:", error);
  }

  return returnWebhookOk({ shop, topic });
};
