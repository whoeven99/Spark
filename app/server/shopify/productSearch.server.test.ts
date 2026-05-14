import { describe, expect, it, vi } from "vitest";
import type { ShopifyAdminGraphqlClient } from "../ai/tool/shopifyShopInfoTool";
import { buildProductTitleSearchQuery, searchProducts } from "./productSearch.server";

describe("buildProductTitleSearchQuery", () => {
  it("wraps trimmed keyword as title wildcard query", () => {
    expect(buildProductTitleSearchQuery("  shoe  ")).toBe("title:*shoe*");
  });

  it("escapes double quotes and backslashes", () => {
    expect(buildProductTitleSearchQuery('a"b')).toBe('title:*a\\"b*');
    expect(buildProductTitleSearchQuery("a\\b")).toBe("title:*a\\\\b*");
  });

  it("returns empty string for blank input", () => {
    expect(buildProductTitleSearchQuery("")).toBe("");
    expect(buildProductTitleSearchQuery("   ")).toBe("");
  });
});

describe("searchProducts", () => {
  it("maps GraphQL edges and skips nodes without id", async () => {
    const admin: ShopifyAdminGraphqlClient = {
      graphql: vi.fn(async () => {
        return new Response(
          JSON.stringify({
            data: {
              products: {
                edges: [
                  {
                    node: {
                      id: "gid://shopify/Product/99",
                      title: "Running Shoes",
                      featuredImage: { url: "https://cdn/j.jpg" },
                    },
                  },
                  { node: { id: "", title: "skip" } },
                ],
              },
            },
          }),
        );
      }),
    };
    const items = await searchProducts(admin, "shoe");
    expect(items).toEqual([
      {
        id: "gid://shopify/Product/99",
        title: "Running Shoes",
        featuredImageUrl: "https://cdn/j.jpg",
      },
    ]);
  });

  it("does not call GraphQL for blank keyword", async () => {
    const graphql = vi.fn();
    const admin: ShopifyAdminGraphqlClient = { graphql };
    await expect(searchProducts(admin, "   ")).resolves.toEqual([]);
    expect(graphql).not.toHaveBeenCalled();
  });
});
