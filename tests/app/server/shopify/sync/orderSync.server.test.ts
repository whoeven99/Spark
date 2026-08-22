import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncOrder } from "../../../../../app/server/shopify/sync/orderSync.server";
import type { ShopifyOrderPayload } from "../../../../../app/server/shopify/sync/types";
import prisma from "../../../../../app/db.server";

vi.mock("../../../../../app/db.server", () => ({
  default: {
    shopOrder: {
      count: vi.fn(),
      upsert: vi.fn(),
    },
    shopOrderLineItem: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock("../../../../../app/server/shopify/sync/customerSync.server", () => ({
  syncCustomer: vi.fn(),
}));

vi.mock("../../../../../app/server/shopify/sync/refundSyncParse.server", () => ({
  sumDiscountedShippingFromLines: vi.fn(() => 0),
}));

describe("syncOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.shopOrder.count).mockResolvedValue(0);
    vi.mocked(prisma.shopOrder.upsert).mockResolvedValue({} as never);
  });

  it("persists geo and locale fields for order segmentation", async () => {
    const payload: ShopifyOrderPayload = {
      id: 1001,
      order_number: 1001,
      email: "buyer@example.com",
      phone: null,
      financial_status: "paid",
      fulfillment_status: null,
      cancel_reason: null,
      cancelled_at: null,
      closed_at: null,
      created_at: "2026-08-22T08:00:00.000Z",
      updated_at: "2026-08-22T08:10:00.000Z",
      processed_at: "2026-08-22T08:05:00.000Z",
      currency: "USD",
      presentment_currency: "eur",
      customer_locale: "fr-FR",
      total_price: "120.50",
      subtotal_price: "100.00",
      total_discounts: "10.00",
      total_tax: "8.50",
      total_shipping_price_set: {
        shop_money: { amount: "12.00" },
      },
      shipping_lines: [],
      source_name: "web",
      landing_site: "https://example.com/products/foo?utm_source=meta&utm_medium=paid&utm_campaign=summer",
      referring_site: "https://instagram.com",
      billing_address: {
        country_code: "fr",
        province_code: "idf",
      },
      shipping_address: {
        country_code: "de",
        province_code: "be",
      },
      tags: "",
      customer: null,
      line_items: [],
    };

    await syncOrder("spark-test.myshopify.com", payload);

    expect(prisma.shopOrder.upsert).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.shopOrder.upsert).mock.calls[0]?.[0]).toMatchObject({
      create: {
        presentmentCurrencyCode: "EUR",
        customerLocale: "fr-FR",
        shippingCountryCode: "DE",
        shippingProvinceCode: "BE",
        billingCountryCode: "FR",
        billingProvinceCode: "IDF",
        utmSource: "meta",
        utmMedium: "paid",
        utmCampaign: "summer",
        isFirstOrder: true,
      },
      update: {
        presentmentCurrencyCode: "EUR",
        customerLocale: "fr-FR",
        shippingCountryCode: "DE",
        shippingProvinceCode: "BE",
        billingCountryCode: "FR",
        billingProvinceCode: "IDF",
      },
    });
  });
});
