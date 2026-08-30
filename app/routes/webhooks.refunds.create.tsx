import type { ActionFunctionArgs } from "react-router";
import { syncRefund } from "../server/shopify/sync/refundSync.server";
import type { ShopifyRefundPayload } from "../server/shopify/sync/types";
import { runShopifyWebhookAction } from "../server/webhook/runShopifyWebhookAction.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  return runShopifyWebhookAction(request, async ({ shop, payload }) => {
    try {
      await syncRefund(shop, payload as ShopifyRefundPayload);
    } catch (error) {
      console.error(`[Webhook] refunds/create sync failed shop=${shop}:`, error);
    }
  });
};
