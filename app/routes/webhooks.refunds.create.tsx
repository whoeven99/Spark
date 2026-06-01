import type { ActionFunctionArgs } from "react-router";
import { syncRefund } from "../server/shopify/sync/refundSync.server";
import type { ShopifyRefundPayload } from "../server/shopify/sync/types";
import {
  authenticateWebhookLogged,
  returnWebhookOk,
} from "../server/webhook/webhookDebugLog.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticateWebhookLogged(request);

  try {
    await syncRefund(shop, payload as ShopifyRefundPayload);
  } catch (error) {
    console.error(`[Webhook] refunds/create sync failed shop=${shop}:`, error);
  }

  return returnWebhookOk({ shop, topic });
};
