import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { syncOrderCancelled } from "../server/shopify/sync/orderSync.server";
import type { ShopifyOrderPayload } from "../server/shopify/sync/types";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.info(`[Webhook] ${topic} shop=${shop}`);

  try {
    await syncOrderCancelled(shop, payload as Partial<ShopifyOrderPayload>);
  } catch (error) {
    console.error(`[Webhook] orders/cancelled sync failed shop=${shop}:`, error);
  }

  return new Response();
};
