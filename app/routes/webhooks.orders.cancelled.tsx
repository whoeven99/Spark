import type { ActionFunctionArgs } from "react-router";
import { syncOrderCancelled } from "../server/shopify/sync/orderSync.server";
import type { ShopifyOrderPayload } from "../server/shopify/sync/types";
import { runShopifyWebhookAction } from "../server/webhook/runShopifyWebhookAction.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  return runShopifyWebhookAction(request, async ({ shop, payload }) => {
    try {
      await syncOrderCancelled(shop, payload as Partial<ShopifyOrderPayload>);
    } catch (error) {
      console.error(`[Webhook] orders/cancelled sync failed shop=${shop}:`, error);
    }
  });
};
