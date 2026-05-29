import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildInitModuleQueryFilterForTest,
  fetchResourceIdsByQuery,
  fetchTranslatableResources,
  ID_BASED_MODULE_QUERY,
  isIdBasedModuleForTest,
} from "../../worker/src/services/shopifyFetch.js";

type GqlResponse = { data?: unknown; errors?: unknown[] };

function mockFetch(handler: (body: { query: string; variables: Record<string, unknown> }) => unknown) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };
    const data = handler(body);
    return {
      ok: true,
      json: async () => ({ data }) satisfies GqlResponse,
      text: async () => JSON.stringify({ data }),
    } as Response;
  });
}

describe("shopifyFetch init routing", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hardcodes published query for ARTICLE/PAGE/COLLECTION", () => {
    expect(ID_BASED_MODULE_QUERY.ARTICLE).toBe("published_status:published");
    expect(ID_BASED_MODULE_QUERY.PAGE).toBe("published_status:published");
    expect(ID_BASED_MODULE_QUERY.COLLECTION).toBe("published_status:published");
    expect(ID_BASED_MODULE_QUERY.PRODUCT).toBe("");
  });

  it("buildInitModuleQueryFilter appends updated_at when provided", () => {
    expect(buildInitModuleQueryFilterForTest("ARTICLE")).toBe("published_status:published");
    expect(buildInitModuleQueryFilterForTest("PRODUCT")).toBeNull();
    expect(buildInitModuleQueryFilterForTest("ARTICLE", "2026-01-01T00:00:00.000Z")).toBe(
      "published_status:published AND updated_at:>'2026-01-01T00:00:00.000Z'",
    );
  });

  it("isIdBasedModuleForTest identifies four modules", () => {
    expect(isIdBasedModuleForTest("PRODUCT")).toBe(true);
    expect(isIdBasedModuleForTest("MENU")).toBe(false);
  });

  it("fetchResourceIdsByQuery uses articles query with published filter", async () => {
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      mockFetch(({ query, variables }) => {
        calls.push({ query, variables });
        expect(query).toContain("articles(");
        expect(variables.query).toBe("published_status:published");
        return {
          articles: {
            edges: [{ node: { id: "gid://shopify/Article/1" } }],
            pageInfo: { hasNextPage: false, endCursor: "c1" },
          },
        };
      }),
    );

    const ids = await fetchResourceIdsByQuery(
      "demo.myshopify.com",
      "token",
      "ARTICLE",
      10,
    );
    expect(ids).toEqual(["gid://shopify/Article/1"]);
    expect(calls.length).toBe(1);
  });

  it("fetchTranslatableResources routes PRODUCT through ID query then byIds", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      mockFetch(({ query, variables }) => {
        if (query.includes("products(")) {
          calls.push("products");
          expect(variables.query).toBeUndefined();
          return {
            products: {
              edges: [{ node: { id: "gid://shopify/Product/1" } }],
              pageInfo: { hasNextPage: false, endCursor: "c1" },
            },
          };
        }
        if (query.includes("translatableResourcesByIds")) {
          calls.push("byIds");
          return {
            translatableResourcesByIds: {
              nodes: [
                {
                  resourceId: "gid://shopify/Product/1",
                  translations: [],
                  translatableContent: [
                    {
                      key: "title",
                      value: "Shirt",
                      digest: "d1",
                      locale: "en",
                      type: "SINGLE_LINE_TEXT_FIELD",
                    },
                  ],
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: "c2" },
            },
          };
        }
        throw new Error(`unexpected query: ${query.slice(0, 40)}`);
      }),
    );

    const chunks = await fetchTranslatableResources(
      "demo.myshopify.com",
      "token",
      "PRODUCT",
      5,
      50,
      { targetLocale: "fr", isCover: false, isHandle: false },
    );

    expect(calls).toEqual(["products", "byIds"]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0][0].resourceId).toBe("gid://shopify/Product/1");
  });

  it("fetchTranslatableResources routes MENU through translatableResources by type", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      mockFetch(({ query }) => {
        if (query.includes("translatableResources(resourceType")) {
          calls.push("byType");
          return {
            translatableResources: {
              edges: [
                {
                  node: {
                    resourceId: "gid://shopify/Menu/1",
                    translations: [],
                    translatableContent: [
                      {
                        key: "title",
                        value: "Main",
                        digest: "d1",
                        locale: "en",
                        type: "SINGLE_LINE_TEXT_FIELD",
                      },
                    ],
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: "c1" },
            },
          };
        }
        throw new Error(`unexpected query: ${query.slice(0, 40)}`);
      }),
    );

    const chunks = await fetchTranslatableResources(
      "demo.myshopify.com",
      "token",
      "MENU",
      5,
      50,
      { targetLocale: "fr", isCover: false, isHandle: false },
    );

    expect(calls).toEqual(["byType"]);
    expect(chunks[0][0].resourceId).toBe("gid://shopify/Menu/1");
  });
});
