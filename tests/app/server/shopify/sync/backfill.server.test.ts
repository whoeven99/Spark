import { describe, expect, it } from "vitest";
import { mapGraphQLToPayload } from "../../../../../app/server/shopify/sync/backfill.server";

describe("mapGraphQLToPayload", () => {
  it("maps order metrics without protected customer fields", () => {
    const node: Parameters<typeof mapGraphQLToPayload>[0] = {
      id: "gid://shopify/Order/1001",
      name: "#1001",
      displayFinancialStatus: "PAID",
      displayFulfillmentStatus: "UNFULFILLED",
      cancelledAt: null,
      cancelReason: null,
      createdAt: "2026-08-22T08:00:00.000Z",
      updatedAt: "2026-08-22T08:10:00.000Z",
      processedAt: "2026-08-22T08:05:00.000Z",
      closedAt: null,
      currencyCode: "USD",
      presentmentCurrencyCode: "EUR",
      customerLocale: "fr-FR",
      subtotalPriceSet: { shopMoney: { amount: "100.00" } },
      totalPriceSet: { shopMoney: { amount: "120.50" } },
      totalDiscountsSet: { shopMoney: { amount: "10.00" } },
      totalTaxSet: { shopMoney: { amount: "8.50" } },
      totalShippingPriceSet: { shopMoney: { amount: "12.00" } },
      shippingLines: { nodes: [] },
      sourceName: "web",
      customerJourneySummary: {
        firstVisit: {
          landingPage: "https://example.com/products/foo",
          referrerUrl: "https://instagram.com",
        },
        lastVisit: {
          landingPage: "https://example.com/products/bar",
          referrerUrl: "https://facebook.com",
        },
      },
      tags: ["vip"],
      customer: {
        id: "gid://shopify/Customer/55",
        numberOfOrders: 3,
        amountSpent: { amount: "300.00" },
        state: "ENABLED",
        tags: ["vip"],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
      lineItems: { nodes: [] },
      refunds: [],
    };

    const payload = mapGraphQLToPayload(node);

    expect(payload.email).toBeNull();
    expect(payload.phone).toBeNull();
    expect(payload.billing_address).toBeNull();
    expect(payload.shipping_address).toBeNull();
    expect(payload.customer).toEqual({
      id: 55,
      email: null,
      phone: null,
      first_name: null,
      last_name: null,
      orders_count: 3,
      total_spent: "300.00",
      state: "ENABLED",
      tags: "vip",
      accepts_marketing: false,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
    });
    expect(payload.presentment_currency).toBe("EUR");
    expect(payload.customer_locale).toBe("fr-FR");
    expect(payload.landing_site).toBe("https://example.com/products/bar");
    expect(payload.referring_site).toBe("https://facebook.com");
  });
});
