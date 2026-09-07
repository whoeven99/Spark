import { describe, expect, it } from "vitest";
import {
  computeProductDuplicate,
  parseProductDuplicateRule,
  PRODUCT_DUPLICATE_DEFAULT_SUFFIX,
} from "../../../app/lib/productDuplicate";
import { computeProductArchive } from "../../../app/lib/bulkArchive";
import { buildShopifyProductCsv, parseProductExportRule } from "../../../app/lib/productExport";

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

describe("productExport", () => {
  it("默认 Shopify CSV", () => {
    expect(parseProductExportRule({})).toEqual({ format: "shopify_csv" });
  });

  it("首行带商品字段、后续变体行只留 handle", () => {
    const csv = buildShopifyProductCsv([
      {
        handle: "bag",
        title: "背包",
        bodyHtml: "<p>hi</p>",
        vendor: "Acme",
        productType: "Bag",
        tags: "a,b",
        published: true,
        status: "ACTIVE",
        seoTitle: "SEO",
        seoDescription: "desc",
        imageSrc: "https://cdn/x.png",
        variants: [
          {
            sku: "A",
            barcode: "1",
            price: "10.00",
            compareAtPrice: "",
            option1Name: "Size",
            option1Value: "M",
            option2Name: "",
            option2Value: "",
            option3Name: "",
            option3Value: "",
          },
          {
            sku: "B",
            barcode: "",
            price: "12.00",
            compareAtPrice: "",
            option1Name: "Size",
            option1Value: "L",
            option2Name: "",
            option2Value: "",
            option3Name: "",
            option3Value: "",
          },
        ],
      },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toContain("Handle");
    expect(lines[1]).toContain("背包");
    expect(lines[2]).not.toContain("背包");
    expect(lines[2]).toContain("B");
  });
});
