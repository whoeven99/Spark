import type { ActionFunctionArgs } from "react-router";
import { syncOrderCancelled } from "../server/shopify/sync/orderSync.server";
import type { ShopifyOrderPayload } from "../server/shopify/sync/types";
import {
  authenticateWebhookLogged,
  returnWebhookOk,
} from "../server/webhook/webhookDebugLog.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticateWebhookLogged(request);

  try {
    await syncOrderCancelled(shop, payload as Partial<ShopifyOrderPayload>);
  } catch (error) {
    console.error(`[Webhook] orders/cancelled sync failed shop=${shop}:`, error);
  }

  return returnWebhookOk({ shop, topic });
};
