import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildShopLocalesPayloadFromGraphqlRows,
  fetchShopLocalesPayloadCached,
  invalidateShopLocalesCache,
} from "../../../../app/server/productImprove/shopLocalesFetcher.server";

describe("buildShopLocalesPayloadFromGraphqlRows", () => {
  it("picks primary locale as default and sorts primary first", () => {
    const payload = buildShopLocalesPayloadFromGraphqlRows([
      { locale: "fr", name: "French", primary: false, published: true },
      { locale: "en", name: "English", primary: true, published: true },
    ]);
    expect(payload.isFallback).toBe(false);
    expect(payload.defaultTargetLanguage).toBe("en");
    expect(payload.localeOptions[0]?.value).toBe("en");
    expect(payload.localeOptions[0]?.published).toBe(true);
  });

  it("dedupes by locale", () => {
    const payload = buildShopLocalesPayloadFromGraphqlRows([
      { locale: "de", name: "German", primary: true, published: true },
      { locale: "de", name: "German duplicate", primary: false, published: true },
    ]);
    expect(payload.localeOptions).toHaveLength(1);
    expect(payload.defaultTargetLanguage).toBe("de");
  });

  it("returns fallback for empty array", () => {
    const payload = buildShopLocalesPayloadFromGraphqlRows([]);
    expect(payload.isFallback).toBe(true);
    expect(payload.defaultTargetLanguage).toBe("en");
    expect(payload.localeOptions.length).toBeGreaterThan(1);
  });
});

describe("fetchShopLocalesPayloadCached", () => {
  const SHOP = "cache-test.myshopify.com";

  beforeEach(() => {
    invalidateShopLocalesCache(SHOP);
  });

  function createAdmin(graphql: ReturnType<typeof vi.fn>) {
    return { graphql } as never;
  }

  function okResponse(body: unknown) {
    return {
      ok: true,
      status: 200,
      json: async () => body,
    };
  }

  it("hits GraphQL once for repeated reads of the same shop", async () => {
    const graphql = vi.fn().mockResolvedValue(
      okResponse({
        data: {
          shopLocales: [
            { locale: "zh-CN", name: "Chinese", primary: true, published: true },
          ],
        },
      }),
    );
    const admin = createAdmin(graphql);

    const first = await fetchShopLocalesPayloadCached(admin, SHOP, "first");
    const second = await fetchShopLocalesPayloadCached(admin, SHOP, "second");

    expect(first.defaultTargetLanguage).toBe("zh-CN");
    expect(second.defaultTargetLanguage).toBe("zh-CN");
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it("does not retain fallback responses in the cache", async () => {
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(okResponse({ data: { shopLocales: [] } }))
      .mockResolvedValueOnce(
        okResponse({
          data: {
            shopLocales: [
              { locale: "en", name: "English", primary: true, published: true },
            ],
          },
        }),
      );
    const admin = createAdmin(graphql);

    const first = await fetchShopLocalesPayloadCached(admin, SHOP, "fallback");
    const second = await fetchShopLocalesPayloadCached(admin, SHOP, "retry");

    expect(first.isFallback).toBe(true);
    expect(second.isFallback).toBe(false);
    expect(second.defaultTargetLanguage).toBe("en");
    expect(graphql).toHaveBeenCalledTimes(2);
  });
});
