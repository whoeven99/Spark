import type { ActionFunctionArgs } from "react-router";
import { syncOrder } from "../server/shopify/sync/orderSync.server";
import type { ShopifyOrderPayload } from "../server/shopify/sync/types";
import { runShopifyWebhookAction } from "../server/webhook/runShopifyWebhookAction.server";
import { maybeTrackTiktokCompletePayment } from "../server/adsCatalog/tiktokPixelConfig.server";
import { maybeTrackMetaPurchase } from "../server/adsCatalog/metaPixelConfig.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  return runShopifyWebhookAction(request, async ({ shop, topic, payload }) => {
    void topic;
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

    try {
      const value = Number.parseFloat(String(order.total_price ?? ""));
      await maybeTrackMetaPurchase({
        shop,
        orderId: String(order.id),
        orderName: order.order_number != null ? String(order.order_number) : undefined,
        value: Number.isFinite(value) ? value : undefined,
        currency: order.currency,
        email: order.email ?? order.customer?.email ?? undefined,
      });
    } catch (error) {
      console.warn(`[Webhook] orders/paid Meta Purchase failed shop=${shop}:`, error);
    }
  });
};
