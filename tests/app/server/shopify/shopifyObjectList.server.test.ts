import { describe, expect, it, vi } from "vitest";
import type { ShopifyAdminGraphqlClient } from "../../../../app/server/ai/skills/shopifyInfo/shopifyInfo.tool";
import {
  listShopifyArticles,
  listShopifyProducts,
} from "../../../../app/server/shopify/shopifyObjectList.server";

describe("listShopifyProducts", () => {
  it("returns multiple products with pagination info", async () => {
    const admin: ShopifyAdminGraphqlClient = {
      graphql: vi.fn(async () => {
        return new Response(
          JSON.stringify({
            data: {
              products: {
                edges: [
                  {
                    node: {
                      id: "gid://shopify/Product/1",
                      title: "Product A",
                      status: "ACTIVE",
                      totalInventory: 4,
                      featuredImage: { url: "https://cdn/a.jpg" },
                      priceRangeV2: { minVariantPrice: { amount: "20.0", currencyCode: "EUR" } },
                    },
                  },
                  {
                    node: {
                      id: "gid://shopify/Product/2",
                      title: "Product B",
                      status: "DRAFT",
                      totalInventory: 0,
                      featuredImage: null,
                      priceRangeV2: { minVariantPrice: { amount: "10.0", currencyCode: "EUR" } },
                    },
                  },
                ],
                pageInfo: { hasNextPage: true, endCursor: "cursor-2" },
              },
              shop: { name: "ciwishop", myshopifyDomain: "ciwishop.myshopify.com" },
            },
          }),
        );
      }),
    };

    const result = await listShopifyProducts(admin, { first: 20 });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.title).toBe("Product A");
    expect(result.items[0]?.meta).toContain("库存 4");
    expect(result.pageInfo).toEqual({ hasNextPage: true, endCursor: "cursor-2" });
  });
});

describe("listShopifyArticles", () => {
  it("returns multiple articles", async () => {
    const admin: ShopifyAdminGraphqlClient = {
      graphql: vi.fn(async () => {
        return new Response(
          JSON.stringify({
            data: {
              articles: {
                edges: [
                  {
                    node: {
                      id: "gid://shopify/Article/1",
                      title: "test article123",
                      isPublished: false,
                      blog: { title: "test17" },
                      author: { name: "aviva xu" },
                    },
                  },
                  {
                    node: {
                      id: "gid://shopify/Article/2",
                      title: "Published post",
                      isPublished: true,
                      blog: { title: "News" },
                      author: { name: "allen" },
                    },
                  },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
              shop: { name: "ciwishop", myshopifyDomain: "ciwishop.myshopify.com" },
            },
          }),
        );
      }),
    };

    const result = await listShopifyArticles(admin, { first: 20 });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.title).toBe("test article123");
    expect(result.items[1]?.statusLabel).toBe("已发布");
  });
});
