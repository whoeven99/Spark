import prisma from "../../../db.server";
import { syncOrder } from "./orderSync.server";
import { syncRefund } from "./refundSync.server";
import type { ShopifyAdminGraphqlClient } from "../../ai/skills/shopifyInfo/tool";
import type { BackfillResult, ShopifyOrderPayload, ShopifyRefundPayload } from "./types";

const ORDERS_BACKFILL_QUERY = `#graphql
  query BackfillOrders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        email
        phone
        displayFinancialStatus
        displayFulfillmentStatus
        cancelledAt
        cancelReason
        createdAt
        updatedAt
        processedAt
        closedAt
        currencyCode
        subtotalPriceSet { shopMoney { amount } }
        totalPriceSet { shopMoney { amount } }
        totalDiscountsSet { shopMoney { amount } }
        totalTaxSet { shopMoney { amount } }
        totalShippingPriceSet { shopMoney { amount } }
        sourceName
        landingPageUrl
        referringSite
        tags
        customer {
          id
          email
          phone
          firstName
          lastName
          numberOfOrders
          amountSpent { amount }
          state
          tags
          emailMarketingConsent { marketingState }
          createdAt
          updatedAt
        }
        lineItems(first: 50) {
          nodes {
            id
            variant { id }
            product { id }
            title
            variantTitle
            sku
            quantity
            originalUnitPriceSet { shopMoney { amount } }
            totalDiscountSet { shopMoney { amount } }
            vendor
          }
        }
        refunds {
          id
          createdAt
          note
          totalRefundedSet { shopMoney { amount } }
          transactions(first: 10) {
            nodes {
              id
              kind
              status
              amountSet { shopMoney { amount } }
            }
          }
        }
      }
    }
  }
`;

type GraphQLOrderNode = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
  closedAt: string | null;
  currencyCode: string;
  subtotalPriceSet: { shopMoney: { amount: string } } | null;
  totalPriceSet: { shopMoney: { amount: string } } | null;
  totalDiscountsSet: { shopMoney: { amount: string } } | null;
  totalTaxSet: { shopMoney: { amount: string } } | null;
  totalShippingPriceSet: { shopMoney: { amount: string } } | null;
  sourceName: string | null;
  landingPageUrl: string | null;
  referringSite: string | null;
  tags: string[];
  customer: {
    id: string;
    email: string | null;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
    numberOfOrders: number;
    amountSpent: { amount: string };
    state: string;
    tags: string[];
    emailMarketingConsent: { marketingState: string } | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  lineItems: {
    nodes: Array<{
      id: string;
      variant: { id: string } | null;
      product: { id: string } | null;
      title: string;
      variantTitle: string | null;
      sku: string | null;
      quantity: number;
      originalUnitPriceSet: { shopMoney: { amount: string } } | null;
      totalDiscountSet: { shopMoney: { amount: string } } | null;
      vendor: string | null;
    }>;
  };
  refunds: Array<{
    id: string;
    createdAt: string;
    note: string | null;
    totalRefundedSet: { shopMoney: { amount: string } } | null;
    transactions: {
      nodes: Array<{
        id: string;
        kind: string;
        status: string;
        amountSet: { shopMoney: { amount: string } };
      }>;
    };
  }>;
};

function gidToId(gid: string): string {
  const parts = gid.split("/");
  return parts[parts.length - 1];
}

function mapGraphQLToPayload(node: GraphQLOrderNode): ShopifyOrderPayload {
  const orderNumber = parseInt(node.name.replace("#", ""), 10) || 0;
  const customerId = node.customer ? gidToId(node.customer.id) : undefined;

  return {
    id: parseInt(gidToId(node.id), 10),
    order_number: orderNumber,
    email: node.email,
    phone: node.phone,
    financial_status: node.displayFinancialStatus?.toLowerCase() ?? null,
    fulfillment_status: node.displayFulfillmentStatus?.toLowerCase() ?? null,
    cancel_reason: node.cancelReason?.toLowerCase() ?? null,
    cancelled_at: node.cancelledAt,
    closed_at: node.closedAt,
    created_at: node.createdAt,
    updated_at: node.updatedAt,
    processed_at: node.processedAt,
    currency: node.currencyCode,
    total_price: node.totalPriceSet?.shopMoney.amount ?? "0",
    subtotal_price: node.subtotalPriceSet?.shopMoney.amount ?? "0",
    total_discounts: node.totalDiscountsSet?.shopMoney.amount ?? "0",
    total_tax: node.totalTaxSet?.shopMoney.amount ?? "0",
    total_shipping_price_set: node.totalShippingPriceSet
      ? { shop_money: { amount: node.totalShippingPriceSet.shopMoney.amount } }
      : undefined,
    source_name: node.sourceName,
    landing_site: node.landingPageUrl,
    referring_site: node.referringSite,
    tags: (node.tags ?? []).join(","),
    customer: node.customer
      ? {
          id: parseInt(customerId ?? "0", 10),
          email: node.customer.email,
          phone: node.customer.phone,
          first_name: node.customer.firstName,
          last_name: node.customer.lastName,
          orders_count: node.customer.numberOfOrders,
          total_spent: node.customer.amountSpent.amount,
          state: node.customer.state,
          tags: (node.customer.tags ?? []).join(","),
          accepts_marketing:
            node.customer.emailMarketingConsent?.marketingState === "SUBSCRIBED",
          created_at: node.customer.createdAt,
          updated_at: node.customer.updatedAt,
        }
      : null,
    line_items: node.lineItems.nodes.map((li) => ({
      id: parseInt(gidToId(li.id), 10),
      variant_id: li.variant ? parseInt(gidToId(li.variant.id), 10) : null,
      product_id: li.product ? parseInt(gidToId(li.product.id), 10) : null,
      title: li.title,
      variant_title: li.variantTitle,
      sku: li.sku,
      quantity: li.quantity,
      price: li.originalUnitPriceSet?.shopMoney.amount ?? "0",
      total_discount: li.totalDiscountSet?.shopMoney.amount ?? "0",
      vendor: li.vendor,
    })),
  };
}

function mapRefundToPayload(
  refund: GraphQLOrderNode["refunds"][number],
  orderId: number,
): ShopifyRefundPayload {
  return {
    id: parseInt(gidToId(refund.id), 10),
    order_id: orderId,
    created_at: refund.createdAt,
    processed_at: refund.createdAt,
    note: refund.note,
    refund_line_items: [],
    transactions: refund.transactions.nodes.map((t) => ({
      id: parseInt(gidToId(t.id), 10),
      order_id: orderId,
      kind: t.kind.toLowerCase(),
      status: t.status.toLowerCase(),
      amount: t.amountSet.shopMoney.amount,
    })),
  };
}

export async function backfillOrders(
  shop: string,
  admin: ShopifyAdminGraphqlClient,
  options: { daysBack?: number; maxPages?: number } = {},
): Promise<BackfillResult> {
  const { daysBack = 90, maxPages = 100 } = options;

  const checkpoint = await prisma.shopSyncCheckpoint.findUnique({
    where: { shop_resource: { shop, resource: "orders" } },
  });

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - daysBack);
  const sinceStr = sinceDate.toISOString().split("T")[0];

  let cursor = checkpoint?.lastCursor ?? null;
  let page = 0;
  let synced = 0;
  let skipped = 0;
  let errors = 0;

  while (page < maxPages) {
    const variables: Record<string, unknown> = {
      first: 50,
      query: `created_at:>=${sinceStr}`,
    };
    if (cursor) variables.after = cursor;

    let response: {
      data?: {
        orders?: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: GraphQLOrderNode[];
        };
      };
    };

    try {
      const rawResponse = await admin.graphql(ORDERS_BACKFILL_QUERY, { variables });
      response = (await rawResponse.json()) as typeof response;
    } catch (err) {
      console.error(`[Backfill] GraphQL error page=${page}`, err);
      errors++;
      break;
    }

    const orders = response.data?.orders;
    if (!orders) break;

    for (const node of orders.nodes) {
      try {
        const payload = mapGraphQLToPayload(node);
        await syncOrder(shop, payload);

        // Sync refunds embedded in order
        for (const refund of node.refunds ?? []) {
          await syncRefund(shop, mapRefundToPayload(refund, payload.id));
        }
        synced++;
      } catch (err) {
        console.error(`[Backfill] order sync error orderId=${node.id}`, err);
        errors++;
      }
    }

    cursor = orders.pageInfo.endCursor;
    page++;

    // Update checkpoint after each page
    await prisma.shopSyncCheckpoint.upsert({
      where: { shop_resource: { shop, resource: "orders" } },
      create: {
        shop,
        resource: "orders",
        lastSyncedAt: new Date(),
        lastCursor: cursor,
      },
      update: {
        lastSyncedAt: new Date(),
        lastCursor: cursor,
      },
    });

    if (!orders.pageInfo.hasNextPage) break;
  }

  console.info(
    `[Backfill] orders done shop=${shop} synced=${synced} skipped=${skipped} errors=${errors} pages=${page}`,
  );

  return { synced, skipped, errors, cursor };
}
