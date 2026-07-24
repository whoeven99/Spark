import { describe, expect, it, vi } from "vitest";
import type { ShopifyAdminGraphqlClient } from "../../../../app/server/ai/skills/shopifyInfo/shopifyInfo.tool";
import {
  countShopifyObjects,
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

describe("countShopifyObjects", () => {
  it("counts all articles by summing blog articlesCount in 2026-07", async () => {
    const queries: string[] = [];
    const admin: ShopifyAdminGraphqlClient = {
      graphql: vi.fn(async (query) => {
        queries.push(query);
        return new Response(
          JSON.stringify({
            data: {
              blogs: {
                edges: [
                  { node: { id: "gid://shopify/Blog/1", articlesCount: { count: 2 } } },
                  { node: { id: "gid://shopify/Blog/2", articlesCount: { count: 3 } } },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          }),
        );
      }),
    };

    const count = await countShopifyObjects(admin, { kind: "article" });
    expect(count).toBe(5);
    expect(queries[0]).toContain("blogs(");
    expect(queries[0]).toContain("articlesCount(limit: null)");
    expect(queries[0]).not.toContain("articlesCount(query");
  });

  it("counts filtered articles by paging the articles connection", async () => {
    const variablesSeen: Array<Record<string, unknown> | undefined> = [];
    const admin: ShopifyAdminGraphqlClient = {
      graphql: vi.fn(async (_query, options) => {
        variablesSeen.push(options?.variables);
        return new Response(
          JSON.stringify({
            data: {
              articles: {
                edges: [
                  { node: { id: "gid://shopify/Article/1" } },
                  { node: { id: "gid://shopify/Article/2" } },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          }),
        );
      }),
    };

    const count = await countShopifyObjects(admin, {
      kind: "article",
      keyword: "launch",
      status: "published",
    });
    expect(count).toBe(2);
    expect(variablesSeen[0]?.query).toContain("title:*launch*");
    expect(variablesSeen[0]?.query).toContain("published_status:published");
  });
});
