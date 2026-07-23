import { beforeEach, describe, expect, it, vi } from "vitest";

const getTiktokCatalogCredential = vi.hoisted(() => vi.fn());
const getTiktokCatalogPending = vi.hoisted(() => vi.fn());
const getTiktokCatalogRegionPreference = vi.hoisted(() => vi.fn());
const setTiktokCatalogCredential = vi.hoisted(() => vi.fn());
const clearTiktokCatalogPending = vi.hoisted(() => vi.fn());
const createTiktokCatalog = vi.hoisted(() => vi.fn());
const createTiktokPixel = vi.hoisted(() => vi.fn());
const bindTiktokCatalogPixelEventSource = vi.hoisted(() => vi.fn());
const fetchTiktokCatalogConf = vi.hoisted(() => vi.fn());
const listAccessibleBcIds = vi.hoisted(() => vi.fn());
const fetchShopBasicInfo = vi.hoisted(() => vi.fn());

vi.mock("../../../../app/server/adsCatalog/credentialStore.server", () => ({
  getTiktokCatalogCredential: (...args: unknown[]) => getTiktokCatalogCredential(...args),
  getTiktokCatalogPending: (...args: unknown[]) => getTiktokCatalogPending(...args),
  getTiktokCatalogRegionPreference: (...args: unknown[]) =>
    getTiktokCatalogRegionPreference(...args),
  setTiktokCatalogCredential: (...args: unknown[]) => setTiktokCatalogCredential(...args),
  clearTiktokCatalogPending: (...args: unknown[]) => clearTiktokCatalogPending(...args),
}));

vi.mock("../../../../app/server/adsCatalog/clients/tiktokCatalogClient.server", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../../app/server/adsCatalog/clients/tiktokCatalogClient.server")
    >();
  return {
    ...actual,
    createTiktokCatalog: (...args: unknown[]) => createTiktokCatalog(...args),
    createTiktokPixel: (...args: unknown[]) => createTiktokPixel(...args),
    bindTiktokCatalogPixelEventSource: (...args: unknown[]) =>
      bindTiktokCatalogPixelEventSource(...args),
    fetchTiktokCatalogConf: (...args: unknown[]) => fetchTiktokCatalogConf(...args),
  };
});

vi.mock("../../../../app/server/adsCatalog/tiktokOAuth.server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../app/server/adsCatalog/tiktokOAuth.server")>();
  return {
    ...actual,
    listAccessibleBcIds: (...args: unknown[]) => listAccessibleBcIds(...args),
  };
});

vi.mock("../../../../app/server/shopify/fetchShopBasicInfo.server", () => ({
  fetchShopBasicInfo: (...args: unknown[]) => fetchShopBasicInfo(...args),
}));

import { ensureTiktokApiManagedCatalog } from "../../../../app/server/adsCatalog/tiktokEnsureApiCatalog.server";

describe("ensureTiktokApiManagedCatalog", () => {
  beforeEach(() => {
    getTiktokCatalogCredential.mockReset();
    getTiktokCatalogPending.mockReset();
    getTiktokCatalogRegionPreference.mockReset();
    setTiktokCatalogCredential.mockReset();
    clearTiktokCatalogPending.mockReset();
    getTiktokCatalogRegionPreference.mockResolvedValue(null);
    createTiktokCatalog.mockReset();
    createTiktokPixel.mockReset();
    bindTiktokCatalogPixelEventSource.mockReset();
    fetchTiktokCatalogConf.mockReset();
    listAccessibleBcIds.mockReset();
    fetchShopBasicInfo.mockReset();
    fetchShopBasicInfo.mockResolvedValue({
      name: "Demo",
      currencyCode: "USD",
      countryCode: "US",
    });
    createTiktokPixel.mockResolvedValue({
      pixelCode: "PX-TEST",
      pixelName: "Spark Pixel — Demo",
    });
    bindTiktokCatalogPixelEventSource.mockResolvedValue({ advertiserId: "adv" });
  });

  it("returns existing api_managed catalog when catalog/get confirms CLIENT channel", async () => {
    getTiktokCatalogCredential.mockResolvedValue({
      accessToken: "tok",
      advertiserId: "adv",
      bcId: "bc",
      catalogId: "cat-api",
      catalogName: "Spark",
      bindingMode: "api_managed",
    });
    fetchTiktokCatalogConf.mockResolvedValue({
      catalogId: "cat-api",
      channel: "CLIENT",
      regionCode: "US",
      isShopifyOfficial: false,
    });

    const result = await ensureTiktokApiManagedCatalog({
      shop: "demo.myshopify.com",
      admin: { graphql: vi.fn() },
    });

    expect(result).toEqual({
      catalogId: "cat-api",
      catalogName: "Spark",
      created: false,
      bindingMode: "api_managed",
    });
    expect(createTiktokCatalog).not.toHaveBeenCalled();
  });

  it("creates a new catalog when api_managed binding has no channel in catalog/get", async () => {
    getTiktokCatalogCredential.mockResolvedValue({
      accessToken: "tok",
      refreshToken: "rt",
      advertiserId: "adv",
      bcId: "bc",
      catalogId: "766338888974542609",
      catalogName: "电商 商品库",
      bindingMode: "api_managed",
    });
    fetchTiktokCatalogConf.mockResolvedValue({
      catalogId: "766338888974542609",
      catalogName: "电商 商品库",
      currency: "EUR",
      catalogType: "ECOM",
      isShopifyOfficial: false,
    });
    getTiktokCatalogPending.mockResolvedValue(null);
    fetchShopBasicInfo.mockResolvedValue({
      name: "Demo",
      currencyCode: "EUR",
      countryCode: "NL",
    });
    createTiktokCatalog.mockResolvedValue({
      catalogId: "cat-new",
      catalogName: "Spark Catalog — Demo",
    });

    const result = await ensureTiktokApiManagedCatalog({
      shop: "demo.myshopify.com",
      admin: { graphql: vi.fn() },
    });

    expect(result.created).toBe(true);
    expect(result.catalogId).toBe("cat-new");
    expect(createTiktokCatalog).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: "EUR",
        countryCode: "NL",
        regionCode: "NL",
      }),
    );
  });

  it("reuses api_managed catalog when region mismatches shop country", async () => {
    getTiktokCatalogCredential.mockResolvedValue({
      accessToken: "tok",
      refreshToken: "rt",
      advertiserId: "adv",
      bcId: "bc",
      catalogId: "cat-de",
      catalogName: "Spark Catalog — Demo",
      bindingMode: "api_managed",
    });
    fetchTiktokCatalogConf.mockResolvedValue({
      catalogId: "cat-de",
      channel: "CLIENT",
      regionCode: "DE",
      currency: "EUR",
      isShopifyOfficial: false,
    });
    getTiktokCatalogPending.mockResolvedValue(null);
    fetchShopBasicInfo.mockResolvedValue({
      name: "Demo",
      currencyCode: "EUR",
      countryCode: "NL",
    });

    const result = await ensureTiktokApiManagedCatalog({
      shop: "demo.myshopify.com",
      admin: { graphql: vi.fn() },
    });

    expect(result).toEqual({
      catalogId: "cat-de",
      catalogName: "Spark Catalog — Demo",
      created: false,
      bindingMode: "api_managed",
    });
    expect(createTiktokCatalog).not.toHaveBeenCalled();
  });

  it("creates a new catalog when api_managed binding has non-CLIENT channel", async () => {
    getTiktokCatalogCredential.mockResolvedValue({
      accessToken: "tok",
      refreshToken: "rt",
      advertiserId: "adv",
      bcId: "bc",
      catalogId: "cat-wrong",
      catalogName: "Manual Catalog",
      bindingMode: "api_managed",
    });
    fetchTiktokCatalogConf.mockResolvedValue({
      catalogId: "cat-wrong",
      channel: "SHOPIFY",
      isShopifyOfficial: false,
    });
    getTiktokCatalogPending.mockResolvedValue(null);
    fetchShopBasicInfo.mockResolvedValue({ name: "Demo", currencyCode: "USD" });
    createTiktokCatalog.mockResolvedValue({
      catalogId: "cat-new",
      catalogName: "Spark Catalog — Demo",
    });

    const result = await ensureTiktokApiManagedCatalog({
      shop: "demo.myshopify.com",
      admin: { graphql: vi.fn() },
    });

    expect(result.created).toBe(true);
    expect(result.catalogId).toBe("cat-new");
    expect(setTiktokCatalogCredential).toHaveBeenCalledWith(
      "demo.myshopify.com",
      expect.objectContaining({
        catalogId: "cat-new",
        bindingMode: "api_managed",
      }),
    );
  });

  it("creates and switches when current mode is shopify_official", async () => {
    getTiktokCatalogCredential.mockResolvedValue({
      accessToken: "tok",
      refreshToken: "rt",
      advertiserId: "adv",
      bcId: "bc",
      catalogId: "cat-official",
      catalogName: "Shopify Catalog",
      bindingMode: "shopify_official",
    });
    getTiktokCatalogPending.mockResolvedValue(null);
    fetchShopBasicInfo.mockResolvedValue({ name: "Demo", currencyCode: "USD" });
    createTiktokCatalog.mockResolvedValue({
      catalogId: "cat-new",
      catalogName: "Spark Catalog — Demo",
    });

    const result = await ensureTiktokApiManagedCatalog({
      shop: "demo.myshopify.com",
      admin: { graphql: vi.fn() },
    });

    expect(result.created).toBe(true);
    expect(result.catalogId).toBe("cat-new");
    expect(setTiktokCatalogCredential).toHaveBeenCalledWith(
      "demo.myshopify.com",
      expect.objectContaining({
        catalogId: "cat-new",
        bindingMode: "api_managed",
      }),
    );
  });
});
