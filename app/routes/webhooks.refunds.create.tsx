import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { syncRefund } from "../server/shopify/sync/refundSync.server";
import type { ShopifyRefundPayload } from "../server/shopify/sync/types";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.info(`[Webhook] ${topic} shop=${shop}`);

  try {
    await syncRefund(shop, payload as ShopifyRefundPayload);
  } catch (error) {
    console.error(`[Webhook] refunds/create sync failed shop=${shop}:`, error);
  }

  return new Response();
};
