import { describe, expect, it } from "vitest";
import type { RawShopifyProductForCatalog } from "~/server/adsCatalog/productFetcher.server";
import { mapShopifyToTiktok } from "~/server/adsCatalog/mappers/shopifyToTiktok";

function baseProduct(
  overrides: Partial<RawShopifyProductForCatalog> = {},
): RawShopifyProductForCatalog {
  return {
    id: "gid://shopify/Product/1",
    title: "Test Product",
    handle: "test-product",
    descriptionHtml: "<p>Hello</p>",
    productType: null,
    vendor: "Acme",
    tags: [],
    status: "ACTIVE",
    onlineStoreUrl: "https://example.myshopify.com/products/test-product",
    featuredImage: { url: "https://cdn.example.com/a.jpg", altText: null },
    images: [{ url: "https://cdn.example.com/a.jpg", altText: null }],
    priceAmount: "19.99",
    priceCurrency: "USD",
    variantId: "gid://shopify/ProductVariant/1",
    sku: "SKU-1",
    barcode: null,
    inventoryQuantity: 5,
    availableForSale: true,
    variantCount: 1,
    variants: [],
    gender: null,
    ageGroup: null,
    ...overrides,
  };
}

const mapContext = { shopDomain: "example.myshopify.com", defaultCurrency: "USD" };

describe("mapShopifyToTiktok availability", () => {
  it("maps in-stock products to IN_STOCK", () => {
    const result = mapShopifyToTiktok(baseProduct({ availableForSale: true }), mapContext);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.availability).toBe("IN_STOCK");
  });

  it("maps out-of-stock products to OUT_OF_STOCK", () => {
    const result = mapShopifyToTiktok(
      baseProduct({ availableForSale: false, inventoryQuantity: 0 }),
      mapContext,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.availability).toBe("OUT_OF_STOCK");
  });
});

describe("mapShopifyToTiktok price_info", () => {
  it("maps Shopify price into ECOM-required price_info object", () => {
    const result = mapShopifyToTiktok(
      baseProduct({ priceAmount: "19.9", priceCurrency: "usd" }),
      mapContext,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.price_info).toEqual({ price: 19.9, currency: "USD" });
    expect(result.item).not.toHaveProperty("price");
  });

  it("skips products without price or currency", () => {
    const missingAmount = mapShopifyToTiktok(
      baseProduct({ priceAmount: null, priceCurrency: "USD" }),
      mapContext,
    );
    expect(missingAmount).toMatchObject({ ok: false, reason: "missing price" });

    const missingCurrency = mapShopifyToTiktok(
      baseProduct({ priceAmount: "10.00", priceCurrency: null }),
      { shopDomain: "example.myshopify.com" },
    );
    expect(missingCurrency).toMatchObject({ ok: false, reason: "missing price" });
  });
});
