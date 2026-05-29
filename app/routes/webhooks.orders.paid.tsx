import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { syncOrder } from "../server/shopify/sync/orderSync.server";
import type { ShopifyOrderPayload } from "../server/shopify/sync/types";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.info(`[Webhook] ${topic} shop=${shop}`);

  try {
    await syncOrder(shop, payload as ShopifyOrderPayload);
  } catch (error) {
    console.error(`[Webhook] orders/paid sync failed shop=${shop}:`, error);
  }

  return new Response();
};
