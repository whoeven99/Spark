import { describe, expect, it } from "vitest";
import {
  normalizeShopifyProductId,
  parseWorkspaceProductsFromText,
  selectedShopifyObjectsToBatchProducts,
} from "~/lib/workspaceContextProducts";

describe("workspaceContextProducts", () => {
  it("parses structured workspace product lines", () => {
    const text = `[工作台上下文]
- 已选商品（共 2 个）：
  • CARISPIBET Sign [ID: gid://shopify/Product/7891790659607] [图片: https://cdn.example/a.jpg]
  • USOR Shoe [ID: 7783635812375]`;

    const products = parseWorkspaceProductsFromText(text);
    expect(products).toHaveLength(2);
    expect(products[0].title).toBe("CARISPIBET Sign");
    expect(products[0].id).toBe("gid://shopify/Product/7891790659607");
    expect(products[0].imageUrl).toBe("https://cdn.example/a.jpg");
    expect(products[1].id).toBe("gid://shopify/Product/7783635812375");
  });

  it("normalizes numeric product ids", () => {
    expect(normalizeShopifyProductId("12345")).toBe("gid://shopify/Product/12345");
  });

  it("maps selected shopify objects to batch products", () => {
    const products = selectedShopifyObjectsToBatchProducts([
      { id: "gid://shopify/Product/1", title: "A", imageUrl: "https://x" },
      { id: "2", title: "B" },
    ]);
    expect(products[1].id).toBe("gid://shopify/Product/2");
  });
});
