import type { ActionFunctionArgs } from "react-router";
import { syncInventoryLevel } from "../server/shopify/sync/inventorySync.server";
import type { ShopifyInventoryLevelPayload } from "../server/shopify/sync/types";
import {
  authenticateWebhookLogged,
  returnWebhookOk,
} from "../server/webhook/webhookDebugLog.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticateWebhookLogged(request);

  try {
    await syncInventoryLevel(shop, payload as ShopifyInventoryLevelPayload);
  } catch (error) {
    console.error(`[Webhook] inventory_levels/update sync failed shop=${shop}:`, error);
  }

  return returnWebhookOk({ shop, topic });
};
