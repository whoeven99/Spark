import prisma from "../../../db.server";
import type { ShopifyFulfillmentPayload } from "./types";

export async function syncFulfillment(
  shop: string,
  payload: ShopifyFulfillmentPayload,
): Promise<void> {
  const shopifyFulfillmentId = String(payload.id);
  const shopifyOrderId = String(payload.order_id);

  // Ensure parent order exists
  const orderExists = await prisma.shopOrder.findUnique({
    where: { shop_shopifyOrderId: { shop, shopifyOrderId } },
    select: { id: true },
  });
  if (!orderExists) {
    console.warn(
      `[Sync] fulfillment skipped — parent order not found shop=${shop} orderId=${shopifyOrderId}`,
    );
    return;
  }

  const shippedAt =
    payload.status === "success" ? new Date(payload.updated_at) : null;
  const deliveredAt =
    payload.shipment_status === "delivered" ? new Date(payload.updated_at) : null;

  await prisma.shopFulfillment.upsert({
    where: { shop_shopifyFulfillmentId: { shop, shopifyFulfillmentId } },
    create: {
      shop,
      shopifyFulfillmentId,
      shopifyOrderId,
      status: payload.status,
      trackingCompany: payload.tracking_company ?? null,
      trackingNumber: payload.tracking_number ?? null,
      trackingUrl: payload.tracking_url ?? null,
      shipmentStatus: payload.shipment_status ?? null,
      createdAt: new Date(payload.created_at),
      updatedAt: new Date(payload.updated_at),
      shippedAt,
      deliveredAt,
    },
    update: {
      status: payload.status,
      trackingCompany: payload.tracking_company ?? null,
      trackingNumber: payload.tracking_number ?? null,
      trackingUrl: payload.tracking_url ?? null,
      shipmentStatus: payload.shipment_status ?? null,
      updatedAt: new Date(payload.updated_at),
      shippedAt,
      deliveredAt,
      syncedAt: new Date(),
    },
  });

  console.info(
    `[Sync] fulfillment upserted shop=${shop} fulfillmentId=${shopifyFulfillmentId} status=${payload.status}`,
  );
}
