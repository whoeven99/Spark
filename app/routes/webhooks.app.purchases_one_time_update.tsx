import type { ActionFunctionArgs } from "react-router";
import { getAppEntry } from "../config/appEntry.server";
import { handleAppPurchaseOneTimeWebhook } from "../server/billing";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.info(`[Billing] webhook ${topic} shop=${shop}`);

  try {
    await handleAppPurchaseOneTimeWebhook({
      shop,
      payload,
      appName: getAppEntry(),
    });
  } catch (error) {
    console.error("[Billing] app_purchases_one_time/update handler failed:", error);
  }

  return new Response();
};
