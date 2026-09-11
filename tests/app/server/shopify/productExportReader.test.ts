import { describe, expect, it } from "vitest";
import { mapProductExportShopifyNode } from "../../../../app/server/shopify/productExportReader.server";

describe("mapProductExportShopifyNode", () => {
  it("maps category, images, cost, weight, inventory and gift card", () => {
    const product = mapProductExportShopifyNode({
      id: "gid://shopify/Product/1",
      title: "礼品卡",
      handle: "gift-card",
      descriptionHtml: "<p>card</p>",
      vendor: "Acme",
      productType: "Card",
      tags: ["gift"],
      status: "ACTIVE",
      publishedAt: "2026-01-01T00:00:00Z",
      isGiftCard: true,
      seo: { title: "SEO", description: "desc" },
      category: { fullName: "Arts & Entertainment > Party Supplies" },
      options: [
        {
          name: "Color",
          position: 1,
          linkedMetafield: { namespace: "shopify", key: "color-pattern" },
        },
      ],
      images: {
        edges: [
          { node: { url: "https://cdn/1.png", altText: "one" } },
          { node: { url: "https://cdn/2.png", altText: "two" } },
        ],
      },
      variants: {
        edges: [
          {
            node: {
              sku: "GC",
              barcode: "9",
              price: "50.00",
              compareAtPrice: "60.00",
              taxable: false,
              taxCode: "",
              inventoryQuantity: 0,
              inventoryPolicy: "DENY",
              selectedOptions: [{ name: "Color", value: "Red" }],
              image: { url: "https://cdn/variant.png" },
              inventoryItem: {
                tracked: true,
                requiresShipping: false,
                unitCost: { amount: "40.00" },
                measurement: { weight: { value: 0.5, unit: "KILOGRAMS" } },
              },
            },
          },
        ],
      },
    });

    expect(product).toMatchObject({
      handle: "gift-card",
      productCategory: "Arts & Entertainment > Party Supplies",
      giftCard: true,
      images: [
        { src: "https://cdn/1.png", altText: "one" },
        { src: "https://cdn/2.png", altText: "two" },
      ],
    });
    expect(product?.variants[0]).toMatchObject({
      sku: "GC",
      option1Name: "Color",
      option1Value: "Red",
      option1LinkedTo: "product.metafields.shopify.color-pattern",
      grams: "500",
      weightUnit: "kg",
      inventoryTracker: "shopify",
      inventoryQty: "0",
      inventoryPolicy: "deny",
      fulfillmentService: "gift_card",
      requiresShipping: false,
      taxable: false,
      cost: "40.00",
      variantImageSrc: "https://cdn/variant.png",
    });
  });

  it("leaves inventory qty blank when the variant is not tracked", () => {
    const product = mapProductExportShopifyNode({
      id: "gid://shopify/Product/2",
      handle: "digital",
      variants: {
        edges: [
          {
            node: {
              sku: "D",
              price: "1.00",
              inventoryQuantity: 0,
              inventoryPolicy: "CONTINUE",
              inventoryItem: { tracked: false, requiresShipping: false },
            },
          },
        ],
      },
    });
    expect(product?.variants[0]).toMatchObject({
      inventoryTracker: "",
      inventoryQty: "",
      inventoryPolicy: "continue",
      fulfillmentService: "manual",
    });
  });
});
