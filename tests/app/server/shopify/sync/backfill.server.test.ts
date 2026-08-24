import { describe, expect, it } from "vitest";
import { mapGraphQLToPayload } from "../../../../../app/server/shopify/sync/backfill.server";

describe("mapGraphQLToPayload", () => {
  it("maps market-related address and locale fields from GraphQL orders", () => {
    const node: Parameters<typeof mapGraphQLToPayload>[0] = {
      id: "gid://shopify/Order/1001",
      name: "#1001",
      email: "buyer@example.com",
      phone: null,
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
      landingPageUrl: "https://example.com/products/foo",
      referringSite: "https://instagram.com",
      billingAddress: {
        countryCodeV2: "FR",
        provinceCode: "IDF",
      },
      shippingAddress: {
        countryCodeV2: "DE",
        provinceCode: "BE",
      },
      tags: ["vip"],
      customer: null,
      lineItems: { nodes: [] },
      refunds: [],
    };

    const payload = mapGraphQLToPayload(node);

    expect(payload.presentment_currency).toBe("EUR");
    expect(payload.customer_locale).toBe("fr-FR");
    expect(payload.billing_address).toEqual({
      country_code: "FR",
      province_code: "IDF",
    });
    expect(payload.shipping_address).toEqual({
      country_code: "DE",
      province_code: "BE",
    });
  });
});
