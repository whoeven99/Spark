import { describe, expect, it } from "vitest";
import type { RawShopifyProductForCatalog } from "../../../../app/server/adsCatalog/productFetcher.server";
import {
  buildTiktokFeedCsv,
  mapShopifyToTiktokFeedCsv,
} from "../../../../app/server/adsCatalog/mappers/shopifyToTiktokFeedCsv";

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

describe("mapShopifyToTiktokFeedCsv", () => {
  it("maps feed CSV required fields with template enums", () => {
    const result = mapShopifyToTiktokFeedCsv(
      baseProduct({
        images: [
          { url: "https://cdn.example.com/a.jpg", altText: null },
          { url: "https://cdn.example.com/b.jpg", altText: null },
        ],
        barcode: "1234567890123",
        googleProductCategory: "Apparel & Accessories",
      }),
      mapContext,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.row).toMatchObject({
      sku_id: "SKU-1",
      title: "Test Product",
      description: "Hello",
      availability: "In stock",
      condition: "New",
      price: "19.99 USD",
      link: "https://example.myshopify.com/products/test-product",
      image_link: "https://cdn.example.com/a.jpg",
      brand: "Acme",
      additional_image_link: "https://cdn.example.com/b.jpg",
      google_product_category: "Apparel & Accessories",
      product_type: "Apparel & Accessories",
      item_group_id: "1",
      gtin: "1234567890123",
    });
  });

  it("uses Out of stock when unavailable", () => {
    const result = mapShopifyToTiktokFeedCsv(
      baseProduct({ availableForSale: false, inventoryQuantity: 0 }),
      mapContext,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.availability).toBe("Out of stock");
  });

  it("skips products missing image", () => {
    const result = mapShopifyToTiktokFeedCsv(
      baseProduct({ featuredImage: null, images: [] }),
      mapContext,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("missing image");
  });
});

describe("buildTiktokFeedCsv", () => {
  it("escapes commas and quotes in CSV cells", () => {
    const mapped = mapShopifyToTiktokFeedCsv(
      baseProduct({ title: 'Shirt, "Blue"', descriptionHtml: "A,B" }),
      mapContext,
    );
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;

    const csv = buildTiktokFeedCsv([mapped.row]);
    expect(csv.startsWith("sku_id,title,description,")).toBe(true);
    expect(csv).toContain('"Shirt, ""Blue"""');
    expect(csv).toContain('"A,B"');
  });
});
