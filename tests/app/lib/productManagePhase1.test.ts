import { describe, expect, it } from "vitest";
import {
  computeProductDuplicate,
  parseProductDuplicateRule,
  PRODUCT_DUPLICATE_DEFAULT_SUFFIX,
} from "../../../app/lib/productDuplicate";
import { computeProductArchive } from "../../../app/lib/bulkArchive";
import {
  buildShopifyProductCsv,
  normalizeProductExportSkipReason,
  parseProductExportRule,
  buildProductExportSkipCsv,
  shopifyWeightToGrams,
  shopifyWeightUnitCsv,
  optionLinkedToCsv,
  SHOPIFY_CSV_HEADERS,
  type ProductExportShopifyProduct,
  type ProductExportShopifyVariant,
} from "../../../app/lib/productExport";

describe("productDuplicate", () => {
  it("默认草稿、带图、标题加 Copy", () => {
    expect(parseProductDuplicateRule({})).toEqual({
      titleSuffix: PRODUCT_DUPLICATE_DEFAULT_SUFFIX,
      includeImages: true,
      newStatus: "DRAFT",
    });
  });

  it("算出新标题", () => {
    const row = computeProductDuplicate(
      { productId: "gid://shopify/Product/1", productTitle: "背包", status: "ACTIVE" },
      parseProductDuplicateRule({}),
    );
    expect(row.newTitle).toBe("背包 (Copy)");
    expect(row.skipped).toBe(false);
  });
});

describe("bulkArchive", () => {
  it("已归档跳过", () => {
    const row = computeProductArchive({
      productId: "gid://shopify/Product/1",
      productTitle: "背包",
      status: "ARCHIVED",
    });
    expect(row.skipped).toBe(true);
    expect(row.skipReason).toBe("no_change");
  });

  it("草稿可以归档", () => {
    const row = computeProductArchive({
      productId: "gid://shopify/Product/1",
      productTitle: "背包",
      status: "DRAFT",
    });
    expect(row.skipped).toBe(false);
    expect(row.afterStatus).toBe("ARCHIVED");
  });
});

function exportVariant(overrides: Partial<ProductExportShopifyVariant> = {}): ProductExportShopifyVariant {
  return {
    sku: "A",
    barcode: "1",
    price: "10.00",
    compareAtPrice: "",
    option1Name: "Size",
    option1Value: "M",
    option1LinkedTo: "",
    option2Name: "",
    option2Value: "",
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
    weightUnit: "g",
    taxCode: "",
    cost: "4.50",
    ...overrides,
  };
}

function exportProduct(overrides: Partial<ProductExportShopifyProduct> = {}): ProductExportShopifyProduct {
  return {
    handle: "bag",
    title: "背包",
    bodyHtml: "<p>hi</p>",
    vendor: "Acme",
    productCategory: "Home & Garden > Linens & Bedding",
    productType: "Bag",
    tags: "a,b",
    published: true,
    giftCard: false,
    status: "ACTIVE",
    seoTitle: "SEO",
    seoDescription: "desc",
    images: [{ src: "https://cdn/x.png", altText: "front" }],
    variants: [exportVariant(), exportVariant({ sku: "B", barcode: "", price: "12.00", option1Value: "L" })],
    ...overrides,
  };
}

describe("productExport", () => {
  it("默认 Shopify CSV", () => {
    expect(parseProductExportRule({})).toEqual({ format: "shopify_csv" });
  });

  it("表头对齐原生商品 CSV 主体列", () => {
    expect(SHOPIFY_CSV_HEADERS).toEqual(
      expect.arrayContaining([
        "Product Category",
        "Option1 Linked To",
        "Variant Grams",
        "Variant Inventory Qty",
        "Image Position",
        "Gift Card",
        "Variant Image",
        "Cost per item",
      ]),
    );
  });

  it("首行带商品字段、后续变体行只留 handle", () => {
    const csv = buildShopifyProductCsv([exportProduct()]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toContain("Handle");
    expect(lines[1]).toContain("背包");
    expect(lines[1]).toContain("Home & Garden > Linens & Bedding");
    expect(lines[1]).toContain("4.50");
    expect(lines[2]).not.toContain("背包");
    expect(lines[2]).toContain("B");
  });

  it("多余图片单独成行，只带 Handle 和图片列", () => {
    const csv = buildShopifyProductCsv([
      exportProduct({
        images: [
          { src: "https://cdn/1.png", altText: "one" },
          { src: "https://cdn/2.png", altText: "two" },
        ],
      }),
    ]);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain("https://cdn/1.png");
    expect(lines[3]).toContain("https://cdn/2.png,2,two");
    expect(lines[3]).not.toContain("背包");
    expect(lines[3]).not.toContain("10.00");
  });

  it("礼品卡导出 Gift Card 与 gift_card 履约服务", () => {
    const csv = buildShopifyProductCsv([
      exportProduct({
        giftCard: true,
        variants: [exportVariant({ fulfillmentService: "gift_card", requiresShipping: false, taxable: false })],
      }),
    ]);
    expect(csv).toContain("gift_card");
    expect(csv).toContain("front,TRUE,SEO");
  });

  it("converts Shopify weight units to grams and CSV display units", () => {
    expect(shopifyWeightToGrams(1.5, "KILOGRAMS")).toBe("1500");
    expect(shopifyWeightToGrams(4, "POUNDS")).toBe("1814");
    expect(shopifyWeightUnitCsv("KILOGRAMS")).toBe("kg");
    expect(shopifyWeightUnitCsv("OUNCES")).toBe("oz");
    expect(optionLinkedToCsv("shopify", "color-pattern")).toBe(
      "product.metafields.shopify.color-pattern",
    );
  });

  it("maps TikTok English skip reasons to stable codes", () => {
    expect(normalizeProductExportSkipReason("missing title")).toBe("missing_title");
    expect(normalizeProductExportSkipReason("missing product link")).toBe("missing_link");
    expect(normalizeProductExportSkipReason("missing_title")).toBe("missing_title");
  });

  it("builds skip csv with localized reason labels", () => {
    const csv = buildProductExportSkipCsv(
      [{ productId: "gid://shopify/Product/1", productTitle: "背包", reason: "missing_title" }],
      (reason) => (reason === "missing_title" ? "缺少标题" : reason),
    );
    expect(csv).toContain("缺少标题");
    expect(csv).not.toContain("missing_title");
  });
});
