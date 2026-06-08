import prisma from "../../../db.server";
import type { ShopifyOrderPayload } from "./types";
import { syncCustomer } from "./customerSync.server";
import { sumDiscountedShippingFromLines } from "./refundSyncParse.server";

function extractUtm(landingSite: string | null): {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
} {
  if (!landingSite)
    return { utmSource: null, utmMedium: null, utmCampaign: null };
  try {
    const url = new URL(landingSite, "https://placeholder.invalid");
    return {
      utmSource: url.searchParams.get("utm_source"),
      utmMedium: url.searchParams.get("utm_medium"),
      utmCampaign: url.searchParams.get("utm_campaign"),
    };
  } catch {
    return { utmSource: null, utmMedium: null, utmCampaign: null };
  }
}

export async function syncOrder(
  shop: string,
  payload: ShopifyOrderPayload,
): Promise<void> {
  const shopifyOrderId = String(payload.id);
  const shopifyCustomerId = payload.customer
    ? String(payload.customer.id)
    : null;
  const utm = extractUtm(payload.landing_site ?? null);

  const totalPrice = parseFloat(payload.total_price ?? "0") || 0;
  const subtotalPrice = parseFloat(payload.subtotal_price ?? "0") || 0;
  const totalDiscounts = parseFloat(payload.total_discounts ?? "0") || 0;
  const totalTax = parseFloat(payload.total_tax ?? "0") || 0;
  const shippingFromLines = sumDiscountedShippingFromLines(
    payload.shipping_lines ?? [],
  );
  const totalShipping =
    shippingFromLines > 0
      ? shippingFromLines
      : parseFloat(payload.total_shipping_price_set?.shop_money?.amount ?? "0") ||
        0;

  // Check first order
  const previousOrders =
    shopifyCustomerId &&
    (await prisma.shopOrder.count({
      where: {
        shop,
        shopifyCustomerId,
        shopifyOrderId: { not: shopifyOrderId },
      },
    }));
  const isFirstOrder = previousOrders === 0;

  await prisma.shopOrder.upsert({
    where: { shop_shopifyOrderId: { shop, shopifyOrderId } },
    create: {
      shop,
      shopifyOrderId,
      orderNumber: payload.order_number,
      email: payload.email ?? null,
      financialStatus: payload.financial_status ?? null,
      fulfillmentStatus: payload.fulfillment_status ?? null,
      status: payload.cancelled_at ? "cancelled" : "open",
      currency: payload.currency ?? "USD",
      totalPrice,
      subtotalPrice,
      totalDiscounts,
      totalTax,
      totalShipping,
      cancelledAt: payload.cancelled_at ? new Date(payload.cancelled_at) : null,
      cancelReason: payload.cancel_reason ?? null,
      createdAt: new Date(payload.created_at),
      updatedAt: new Date(payload.updated_at),
      processedAt: payload.processed_at ? new Date(payload.processed_at) : null,
      paidAt:
        payload.financial_status === "paid" && payload.processed_at
          ? new Date(payload.processed_at)
          : null,
      closedAt: payload.closed_at ? new Date(payload.closed_at) : null,
      shopifyCustomerId,
      customerFirstName: payload.customer?.first_name ?? null,
      customerLastName: payload.customer?.last_name ?? null,
      customerEmail: payload.customer?.email ?? null,
      tags: payload.tags ?? null,
      sourceName: payload.source_name ?? null,
      landingSite: payload.landing_site ?? null,
      referringSite: payload.referring_site ?? null,
      ...utm,
      isFirstOrder,
    },
    update: {
      email: payload.email ?? null,
      financialStatus: payload.financial_status ?? null,
      fulfillmentStatus: payload.fulfillment_status ?? null,
      status: payload.cancelled_at ? "cancelled" : "open",
      totalPrice,
      subtotalPrice,
      totalDiscounts,
      totalTax,
      totalShipping,
      cancelledAt: payload.cancelled_at ? new Date(payload.cancelled_at) : null,
      cancelReason: payload.cancel_reason ?? null,
      updatedAt: new Date(payload.updated_at),
      processedAt: payload.processed_at ? new Date(payload.processed_at) : null,
      paidAt:
        payload.financial_status === "paid" && payload.processed_at
          ? new Date(payload.processed_at)
          : null,
      closedAt: payload.closed_at ? new Date(payload.closed_at) : null,
      customerFirstName: payload.customer?.first_name ?? null,
      customerLastName: payload.customer?.last_name ?? null,
      customerEmail: payload.customer?.email ?? null,
      tags: payload.tags ?? null,
      syncedAt: new Date(),
    },
  });

  // Sync line items
  if (payload.line_items?.length) {
    for (const item of payload.line_items) {
      const lineItemId = String(item.id);
      await prisma.shopOrderLineItem.upsert({
        where: { shop_lineItemId: { shop, lineItemId } },
        create: {
          shop,
          shopifyOrderId,
          lineItemId,
          inventoryItemId: item.inventory_item_id
            ? String(item.inventory_item_id)
            : null,
          variantId: item.variant_id ? String(item.variant_id) : null,
          productId: item.product_id ? String(item.product_id) : null,
          title: item.title,
          variantTitle: item.variant_title ?? null,
          sku: item.sku ?? null,
          quantity: item.quantity,
          price: parseFloat(item.price ?? "0") || 0,
          totalDiscount: parseFloat(item.total_discount ?? "0") || 0,
          vendor: item.vendor ?? null,
        },
        update: {
          inventoryItemId: item.inventory_item_id
            ? String(item.inventory_item_id)
            : null,
          variantId: item.variant_id ? String(item.variant_id) : null,
          productId: item.product_id ? String(item.product_id) : null,
          title: item.title,
          variantTitle: item.variant_title ?? null,
          sku: item.sku ?? null,
          quantity: item.quantity,
          price: parseFloat(item.price ?? "0") || 0,
          totalDiscount: parseFloat(item.total_discount ?? "0") || 0,
          vendor: item.vendor ?? null,
        },
      });
    }
  }

  // Sync customer
  if (payload.customer) {
    await syncCustomer(shop, payload.customer);
  }

  console.info(
    `[Sync] order upserted shop=${shop} orderId=${shopifyOrderId} financial=${payload.financial_status}`,
  );
}

export async function syncOrderCancelled(
  shop: string,
  payload: Partial<ShopifyOrderPayload>,
): Promise<void> {
  if (!payload.id) return;
  const shopifyOrderId = String(payload.id);

  await prisma.shopOrder.updateMany({
    where: { shop, shopifyOrderId },
    data: {
      status: "cancelled",
      financialStatus: payload.financial_status ?? undefined,
      cancelledAt: payload.cancelled_at
        ? new Date(payload.cancelled_at)
        : new Date(),
      cancelReason: payload.cancel_reason ?? null,
      updatedAt: payload.updated_at ? new Date(payload.updated_at) : new Date(),
      syncedAt: new Date(),
    },
  });

  console.info(`[Sync] order cancelled shop=${shop} orderId=${shopifyOrderId}`);
}
