import { describe, expect, it } from "vitest";
import {
  buildAmazonProductCsv,
  buildTemuProductCsv,
  buildTiktokShopProductCsv,
  gramsToKg,
  guessGtinType,
  stripHtmlToText,
} from "../../../app/lib/productExportPlatformCsv";
import type {
  ProductExportShopifyProduct,
  ProductExportShopifyVariant,
} from "../../../app/lib/productExport";

function exportVariant(overrides: Partial<ProductExportShopifyVariant> = {}): ProductExportShopifyVariant {
  return {
    sku: "A",
    barcode: "012345678905",
    price: "10.00",
    compareAtPrice: "",
    option1Name: "Color",
    option1Value: "Red",
    option1LinkedTo: "",
    option2Name: "Size",
    option2Value: "M",
    option2LinkedTo: "",
    option3Name: "",
    option3Value: "",
    option3LinkedTo: "",
    grams: "500",
    inventoryTracker: "shopify",
    inventoryQty: "3",
    inventoryPolicy: "deny",
    fulfillmentService: "manual",
    requiresShipping: true,
    taxable: true,
    variantImageSrc: "",
    weightUnit: "kg",
    taxCode: "",
    cost: "",
    ...overrides,
  };
}

function exportProduct(overrides: Partial<ProductExportShopifyProduct> = {}): ProductExportShopifyProduct {
  return {
    id: "gid://shopify/Product/1",
    handle: "backpack",
    title: "背包",
    bodyHtml: "<p>Travel <b>bag</b></p>",
    vendor: "Acme",
    productCategory: "Home & Garden",
    productType: "Bag",
    tags: "a,b",
    published: true,
    giftCard: false,
    status: "ACTIVE",
    seoTitle: "",
    seoDescription: "",
    images: [{ src: "https://cdn/1.png", altText: "front" }, { src: "https://cdn/2.png", altText: "side" }],
    variants: [exportVariant()],
    ...overrides,
  };
}

describe("productExportPlatformCsv helpers", () => {
  it("strips html, guesses gtin type, and converts grams", () => {
    expect(stripHtmlToText("<p>Travel &amp; <b>bag</b></p>")).toBe("Travel & bag");
    expect(guessGtinType("012345678905")).toBe("UPC");
    expect(guessGtinType("1234567890123")).toBe("EAN");
    expect(gramsToKg("500")).toBe("0.5");
  });
});

describe("buildAmazonProductCsv", () => {
  it("writes a parent row plus children for multi-variant products", () => {
    const csv = buildAmazonProductCsv([
      exportProduct({
        variants: [
          exportVariant({ sku: "A-RED-M", option1Value: "Red", option2Value: "M" }),
          exportVariant({ sku: "A-BLUE-L", option1Value: "Blue", option2Value: "L", barcode: "" }),
        ],
      }),
    ]);
    expect(csv.csv).toContain("item_sku,parent_sku,parent_child");
    expect(csv.csv).toContain("backpack,,Parent");
    expect(csv.csv).toContain("A-RED-M,backpack,Child,Variation,Color-Size");
    expect(csv.exportedProducts).toHaveLength(1);
    expect(csv.skips).toEqual([]);
    expect(csv.warnings.some((row) => row.reason === "missing_gtin")).toBe(false);
  });

  it("hard-skips a product with no title and still exports siblings", () => {
    const result = buildAmazonProductCsv([
      exportProduct({ title: "", handle: "empty" }),
      exportProduct({ id: "gid://shopify/Product/2", handle: "hat", title: "帽子" }),
    ]);
    expect(result.skips).toEqual([
      expect.objectContaining({ productId: "gid://shopify/Product/1", reason: "missing_title" }),
    ]);
    expect(result.exportedProducts.map((item) => item.handle)).toEqual(["hat"]);
  });

  it("exports with a gtin warning when barcode is missing", () => {
    const result = buildAmazonProductCsv([
      exportProduct({ variants: [exportVariant({ barcode: "" })] }),
    ]);
    expect(result.exportedProducts).toHaveLength(1);
    expect(result.skips).toEqual([]);
    expect(result.warnings).toEqual([
      expect.objectContaining({ reason: "missing_gtin" }),
    ]);
    expect(result.csv).toContain("A,");
  });

  it("skips variants without sku and warns when some remain", () => {
    const result = buildAmazonProductCsv([
      exportProduct({
        variants: [exportVariant({ sku: "" }), exportVariant({ sku: "KEEP", option1Value: "Blue" })],
      }),
    ]);
    expect(result.exportedProducts).toHaveLength(1);
    expect(result.csv).toContain("KEEP");
    expect(result.csv).not.toMatch(/(^|,)A(,|$)/);
    expect(result.warnings.some((row) => row.reason === "partial_variants_skipped")).toBe(true);
  });
});

describe("buildTemuProductCsv", () => {
  it("joins images and maps option specs", () => {
    const result = buildTemuProductCsv([exportProduct()]);
    expect(result.csv).toContain("product_name,product_description,product_code,sku");
    expect(result.csv).toContain("https://cdn/1.png;https://cdn/2.png");
    expect(result.csv).toContain("Color,Red,Size,M");
    expect(result.exportedProducts).toHaveLength(1);
  });
});

describe("buildTiktokShopProductCsv", () => {
  it("writes shop starter columns distinct from ads catalog feed", () => {
    const result = buildTiktokShopProductCsv([exportProduct()]);
    expect(result.csv).toContain("product_name,product_description,main_image");
    expect(result.csv).not.toContain("sku_id");
    expect(result.csv).toContain("https://cdn/1.png,https://cdn/2.png");
    expect(result.csv).toContain("variation_1_name");
  });
});
