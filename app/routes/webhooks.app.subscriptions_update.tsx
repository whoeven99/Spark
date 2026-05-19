import type { ActionFunctionArgs } from "react-router";
import { getAppEntry } from "../config/appEntry.server";
import { handleAppSubscriptionWebhook } from "../server/billing";
import { authenticate, unauthenticated } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.info(`[Billing] webhook ${topic} shop=${shop}`);

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

  return new Response();
};
