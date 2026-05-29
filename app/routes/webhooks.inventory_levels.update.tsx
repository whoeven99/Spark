import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { syncInventoryLevel } from "../server/shopify/sync/inventorySync.server";
import type { ShopifyInventoryLevelPayload } from "../server/shopify/sync/types";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.info(`[Webhook] ${topic} shop=${shop}`);

  try {
    await syncInventoryLevel(shop, payload as ShopifyInventoryLevelPayload);
  } catch (error) {
    console.error(`[Webhook] inventory_levels/update sync failed shop=${shop}:`, error);
  }

  return new Response();
};
