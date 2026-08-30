import type { ActionFunctionArgs } from "react-router";
import { syncFulfillment } from "../server/shopify/sync/fulfillmentSync.server";
import type { ShopifyFulfillmentPayload } from "../server/shopify/sync/types";
import { runShopifyWebhookAction } from "../server/webhook/runShopifyWebhookAction.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  return runShopifyWebhookAction(request, async ({ shop, payload }) => {
    try {
      await syncFulfillment(shop, payload as ShopifyFulfillmentPayload);
    } catch (error) {
      console.error(`[Webhook] fulfillments/create sync failed shop=${shop}:`, error);
    }
  });
};
