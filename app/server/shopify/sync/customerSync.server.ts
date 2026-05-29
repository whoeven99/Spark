import prisma from "../../../db.server";
import type { ShopifyCustomerInOrder } from "./types";

export async function syncCustomer(
  shop: string,
  customer: ShopifyCustomerInOrder,
): Promise<void> {
  const shopifyCustomerId = String(customer.id);
  const totalSpent = parseFloat(customer.total_spent ?? "0") || 0;

  await prisma.shopCustomer.upsert({
    where: { shop_shopifyCustomerId: { shop, shopifyCustomerId } },
    create: {
      shop,
      shopifyCustomerId,
      email: customer.email ?? null,
      phone: customer.phone ?? null,
      firstName: customer.first_name ?? null,
      lastName: customer.last_name ?? null,
      ordersCount: customer.orders_count ?? 0,
      totalSpent,
      state: customer.state ?? null,
      tags: customer.tags ?? null,
      acceptsMarketing: customer.accepts_marketing ?? false,
      createdAt: new Date(customer.created_at),
      updatedAt: new Date(customer.updated_at),
    },
    update: {
      email: customer.email ?? null,
      phone: customer.phone ?? null,
      firstName: customer.first_name ?? null,
      lastName: customer.last_name ?? null,
      ordersCount: customer.orders_count ?? 0,
      totalSpent,
      state: customer.state ?? null,
      tags: customer.tags ?? null,
      acceptsMarketing: customer.accepts_marketing ?? false,
      updatedAt: new Date(customer.updated_at),
      syncedAt: new Date(),
    },
  });
}
