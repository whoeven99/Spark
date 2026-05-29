import prisma from "../../../db.server";
import type { ShopifyRefundPayload } from "./types";

export async function syncRefund(
  shop: string,
  payload: ShopifyRefundPayload,
): Promise<void> {
  const shopifyRefundId = String(payload.id);
  const shopifyOrderId = String(payload.order_id);

  // Ensure parent order exists
  const orderExists = await prisma.shopOrder.findUnique({
    where: { shop_shopifyOrderId: { shop, shopifyOrderId } },
    select: { id: true },
  });
  if (!orderExists) {
    console.warn(
      `[Sync] refund skipped — parent order not found shop=${shop} orderId=${shopifyOrderId}`,
    );
    return;
  }

  // Sum refund transactions (kind=refund, status=success)
  const refundAmount = (payload.transactions ?? [])
    .filter((t) => t.kind === "refund" && t.status === "success")
    .reduce((sum, t) => sum + (parseFloat(t.amount ?? "0") || 0), 0);

  await prisma.shopRefund.upsert({
    where: { shop_shopifyRefundId: { shop, shopifyRefundId } },
    create: {
      shop,
      shopifyRefundId,
      shopifyOrderId,
      refundAmount,
      refundNote: payload.note ?? null,
      processedAt: payload.processed_at
        ? new Date(payload.processed_at)
        : new Date(payload.created_at),
      createdAt: new Date(payload.created_at),
    },
    update: {
      refundAmount,
      refundNote: payload.note ?? null,
      processedAt: payload.processed_at
        ? new Date(payload.processed_at)
        : new Date(payload.created_at),
      syncedAt: new Date(),
    },
  });

  console.info(
    `[Sync] refund upserted shop=${shop} refundId=${shopifyRefundId} amount=${refundAmount}`,
  );
}
