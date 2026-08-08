import { describe, expect, it } from "vitest";
import {
  GOOGLE_OFFER_ID_FIXTURES,
  resolveGoogleOfferId,
} from "../../../../app/lib/googleOfferId";
import type { RawShopifyProductForCatalog } from "../../../../app/server/adsCatalog/productFetcher.server";
import { validateProductsForGoogle } from "../../../../app/server/adsCatalog/validators/googleProductValidator";

function product(id: string, sku: string): RawShopifyProductForCatalog {
  return {
    id: `gid://shopify/Product/${id}`,
    title: `Product ${id}`,
    handle: `product-${id}`,
    descriptionHtml: "<p>Complete product description</p>",
    productType: null,
    vendor: "Spark",
    tags: [],
    status: "ACTIVE",
    onlineStoreUrl: `https://example.com/products/product-${id}`,
    featuredImage: { url: "https://example.com/image.jpg", altText: null },
    images: [],
    priceAmount: "10.00",
    priceCurrency: "USD",
    variantId: `gid://shopify/ProductVariant/${id}1`,
    sku,
    barcode: null,
    inventoryQuantity: 1,
    availableForSale: true,
    variantCount: 1,
    variants: [
      {
        id: `gid://shopify/ProductVariant/${id}1`,
        title: "Default",
        sku,
        barcode: null,
        price: "10.00",
        compareAtPrice: null,
        inventoryQuantity: 1,
        availableForSale: true,
        inventoryPolicy: "DENY",
        color: null,
        size: null,
      },
    ],
    gender: null,
    ageGroup: null,
  };
}

describe("Google offerId 契约", () => {
  it.each(GOOGLE_OFFER_ID_FIXTURES)(
    "为 $sku 生成 $expected",
    ({ expected, ...input }) => {
      expect(resolveGoogleOfferId(input)).toBe(expected);
    },
  );

  it("阻塞跨商品重复 SKU", () => {
    const report = validateProductsForGoogle([
      product("100", " DUPLICATE "),
      product("200", "DUPLICATE"),
    ]);

    expect(report.hasErrors).toBe(2);
    expect(report.products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "error",
          issues: expect.arrayContaining([
            expect.objectContaining({ rule: "DUPLICATE_OFFER_ID" }),
          ]),
        }),
      ]),
    );
  });
});
