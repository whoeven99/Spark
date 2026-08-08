import type { ActionFunctionArgs } from "react-router";
import { syncOrder } from "../server/shopify/sync/orderSync.server";
import type { ShopifyOrderPayload } from "../server/shopify/sync/types";
import {
  authenticateWebhookLogged,
  returnWebhookOk,
} from "../server/webhook/webhookDebugLog.server";
import { maybeTrackTiktokCompletePayment } from "../server/adsCatalog/tiktokPixelConfig.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticateWebhookLogged(request);
  const order = payload as ShopifyOrderPayload;

  try {
    await syncOrder(shop, order);
  } catch (error) {
    console.error(`[Webhook] orders/paid sync failed shop=${shop}:`, error);
  }

  try {
    const value = Number.parseFloat(String(order.total_price ?? ""));
    await maybeTrackTiktokCompletePayment({
      shop,
      orderId: String(order.id),
      orderName: order.order_number != null ? String(order.order_number) : undefined,
      value: Number.isFinite(value) ? value : undefined,
      currency: order.currency,
      email: order.email ?? order.customer?.email ?? undefined,
    });
  } catch (error) {
    console.warn(`[Webhook] orders/paid TikTok CompletePayment failed shop=${shop}:`, error);
  }

  return returnWebhookOk({ shop, topic });
};
