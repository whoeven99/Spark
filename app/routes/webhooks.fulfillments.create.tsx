import type { ActionFunctionArgs } from "react-router";
import { syncFulfillment } from "../server/shopify/sync/fulfillmentSync.server";
import type { ShopifyFulfillmentPayload } from "../server/shopify/sync/types";
import {
  authenticateWebhookLogged,
  returnWebhookOk,
} from "../server/webhook/webhookDebugLog.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticateWebhookLogged(request);

  try {
    await syncFulfillment(shop, payload as ShopifyFulfillmentPayload);
  } catch (error) {
    console.error(`[Webhook] fulfillments/create sync failed shop=${shop}:`, error);
  }

  return returnWebhookOk({ shop, topic });
};
