import prisma from "../../../db.server";
import type { ShopifyRefundPayload } from "./types";

function parseMoney(value: string | null | undefined): number {
  return parseFloat(value ?? "0") || 0;
}

function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

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
    .reduce((sum, t) => sum + parseMoney(t.amount), 0);

  // Shipping refund amount + tax come from order_adjustments with kind=shipping_refund
  const shippingAdjustments = (payload.order_adjustments ?? []).filter(
    (adj) => adj.kind === "shipping_refund",
  );
  const shippingRefundAmount = shippingAdjustments.reduce(
    (sum, adj) => sum + Math.abs(parseMoney(adj.amount)),
    0,
  );
  const shippingRefundTax = shippingAdjustments.reduce(
    (sum, adj) => sum + Math.abs(parseMoney(adj.tax_amount)),
    0,
  );

  const refundLineReasons = (payload.refund_line_items ?? [])
    .map((item) => firstNonEmpty(item.reason, item.restock_type))
    .filter(Boolean);
  const reason = firstNonEmpty(
    refundLineReasons.length > 0 ? refundLineReasons.join(", ") : null,
    payload.note,
  );

  await prisma.shopRefund.upsert({
    where: { shop_shopifyRefundId: { shop, shopifyRefundId } },
    create: {
      shop,
      shopifyRefundId,
      shopifyOrderId,
      refundAmount,
      shippingRefundAmount,
      shippingRefundTax,
      refundNote: payload.note ?? null,
      reason,
      processedAt: payload.processed_at
        ? new Date(payload.processed_at)
        : new Date(payload.created_at),
      createdAt: new Date(payload.created_at),
    },
    update: {
      refundAmount,
      shippingRefundAmount,
      shippingRefundTax,
      refundNote: payload.note ?? null,
      reason,
      processedAt: payload.processed_at
        ? new Date(payload.processed_at)
        : new Date(payload.created_at),
      syncedAt: new Date(),
    },
  });

  for (const refundLine of payload.refund_line_items ?? []) {
    const refundLineItemId = String(refundLine.id);
    const lineItemId = String(refundLine.line_item_id);
    const orderLine = await prisma.shopOrderLineItem.findUnique({
      where: { shop_lineItemId: { shop, lineItemId } },
      select: {
        inventoryItemId: true,
        variantId: true,
        productId: true,
        title: true,
        variantTitle: true,
        sku: true,
      },
    });
    const payloadLine = refundLine.line_item;
    const lineReason = firstNonEmpty(
      refundLine.reason,
      refundLine.restock_type,
      reason,
    );

    await prisma.shopRefundLineItem.upsert({
      where: { shop_refundLineItemId: { shop, refundLineItemId } },
      create: {
        shop,
        shopifyRefundId,
        shopifyOrderId,
        refundLineItemId,
        lineItemId,
        inventoryItemId:
          orderLine?.inventoryItemId ??
          (payloadLine?.inventory_item_id
            ? String(payloadLine.inventory_item_id)
            : null),
        variantId:
          orderLine?.variantId ??
          (payloadLine?.variant_id ? String(payloadLine.variant_id) : null),
        productId:
          orderLine?.productId ??
          (payloadLine?.product_id ? String(payloadLine.product_id) : null),
        title: orderLine?.title ?? payloadLine?.title ?? null,
        variantTitle:
          orderLine?.variantTitle ?? payloadLine?.variant_title ?? null,
        sku: orderLine?.sku ?? payloadLine?.sku ?? null,
        quantity: refundLine.quantity ?? 0,
        subtotal: parseMoney(refundLine.subtotal),
        totalTax: parseMoney(refundLine.total_tax),
        reason: lineReason,
        restockType: refundLine.restock_type ?? null,
      },
      update: {
        inventoryItemId:
          orderLine?.inventoryItemId ??
          (payloadLine?.inventory_item_id
            ? String(payloadLine.inventory_item_id)
            : null),
        variantId:
          orderLine?.variantId ??
          (payloadLine?.variant_id ? String(payloadLine.variant_id) : null),
        productId:
          orderLine?.productId ??
          (payloadLine?.product_id ? String(payloadLine.product_id) : null),
        title: orderLine?.title ?? payloadLine?.title ?? null,
        variantTitle:
          orderLine?.variantTitle ?? payloadLine?.variant_title ?? null,
        sku: orderLine?.sku ?? payloadLine?.sku ?? null,
        quantity: refundLine.quantity ?? 0,
        subtotal: parseMoney(refundLine.subtotal),
        totalTax: parseMoney(refundLine.total_tax),
        reason: lineReason,
        restockType: refundLine.restock_type ?? null,
        syncedAt: new Date(),
      },
    });
  }

  console.info(
    `[Sync] refund upserted shop=${shop} refundId=${shopifyRefundId} amount=${refundAmount}`,
  );
}
