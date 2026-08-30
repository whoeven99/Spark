import type { ActionFunctionArgs } from "react-router";
import { syncInventoryLevel } from "../server/shopify/sync/inventorySync.server";
import type { ShopifyInventoryLevelPayload } from "../server/shopify/sync/types";
import { runShopifyWebhookAction } from "../server/webhook/runShopifyWebhookAction.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  return runShopifyWebhookAction(request, async ({ shop, payload }) => {
    try {
      await syncInventoryLevel(shop, payload as ShopifyInventoryLevelPayload);
    } catch (error) {
      console.error(`[Webhook] inventory_levels/update sync failed shop=${shop}:`, error);
    }
  });
};
