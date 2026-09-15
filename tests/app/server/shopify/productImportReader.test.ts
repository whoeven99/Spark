import { describe, expect, it, vi } from "vitest";
import type { ShopifyAdminGraphqlClient } from "../../../../app/server/ai/skills/shopifyInfo/shopifyInfo.tool";
import { fetchProductsForImport } from "../../../../app/server/shopify/productImportReader.server";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("fetchProductsForImport", () => {
  it("pages product metafields instead of keeping only the first 30", async () => {
    const graphql = vi.fn(async (_query: string, options?: { variables?: Record<string, unknown> }) => {
      if (options?.variables?.id) {
        expect(options.variables.id).toBe("gid://shopify/Product/1");
        expect(options.variables.after).toBe("cursor-30");
        return jsonResponse({
          data: {
            node: {
              metafields: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [{ namespace: "custom", key: "extra", type: "single_line_text_field", value: "31" }],
              },
            },
          },
        });
      }
      return jsonResponse({
        data: {
          products: {
            pageInfo: { hasNextPage: false, endCursor: null },
            edges: [
              {
                node: {
                  id: "gid://shopify/Product/1",
                  title: "Tee",
                  handle: "tee",
                  descriptionHtml: "",
                  vendor: "Acme",
                  productType: "",
                  status: "ACTIVE",
                  tags: [],
                  totalInventory: 0,
                  tracksInventory: false,
                  publishedAt: null,
                  seo: { title: "", description: "" },
                  metafields: {
                    pageInfo: { hasNextPage: true, endCursor: "cursor-30" },
                    nodes: [
                      {
                        namespace: "custom",
                        key: "fabric",
                        type: "single_line_text_field",
                        value: "cotton",
                      },
                    ],
                  },
                  variants: {
                    nodes: [
                      {
                        id: "gid://shopify/ProductVariant/1",
                        title: "Default",
                        sku: "TEE-1",
                        price: "10.00",
                        compareAtPrice: null,
                        inventoryItem: { id: "gid://shopify/InventoryItem/1", unitCost: { amount: "4.00" } },
                        metafields: {
                          pageInfo: { hasNextPage: false, endCursor: null },
                          nodes: [],
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      });
    });
    const admin = { graphql } as unknown as ShopifyAdminGraphqlClient;
    const products = await fetchProductsForImport(
      admin,
      { handles: ["tee"], skus: [], productIds: [] },
      { includeMetafields: true },
    );
    expect(products[0]?.metafields).toEqual([
      { namespace: "custom", key: "fabric", type: "single_line_text_field", value: "cotton" },
      { namespace: "custom", key: "extra", type: "single_line_text_field", value: "31" },
    ]);
    expect(graphql).toHaveBeenCalledTimes(2);
  });
});
