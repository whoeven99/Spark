import { beforeEach, describe, expect, it, vi } from "vitest";

const getTiktokCatalogCredential = vi.hoisted(() => vi.fn());
const getTiktokCatalogPending = vi.hoisted(() => vi.fn());
const setTiktokCatalogCredential = vi.hoisted(() => vi.fn());
const clearTiktokCatalogPending = vi.hoisted(() => vi.fn());
const createTiktokCatalog = vi.hoisted(() => vi.fn());
const listAccessibleBcIds = vi.hoisted(() => vi.fn());
const fetchShopBasicInfo = vi.hoisted(() => vi.fn());

vi.mock("../../../../app/server/adsCatalog/credentialStore.server", () => ({
  getTiktokCatalogCredential: (...args: unknown[]) => getTiktokCatalogCredential(...args),
  getTiktokCatalogPending: (...args: unknown[]) => getTiktokCatalogPending(...args),
  setTiktokCatalogCredential: (...args: unknown[]) => setTiktokCatalogCredential(...args),
  clearTiktokCatalogPending: (...args: unknown[]) => clearTiktokCatalogPending(...args),
}));

vi.mock("../../../../app/server/adsCatalog/clients/tiktokCatalogClient.server", () => ({
  createTiktokCatalog: (...args: unknown[]) => createTiktokCatalog(...args),
}));

vi.mock("../../../../app/server/adsCatalog/tiktokOAuth.server", () => ({
  listAccessibleBcIds: (...args: unknown[]) => listAccessibleBcIds(...args),
}));

vi.mock("../../../../app/server/shopify/fetchShopBasicInfo.server", () => ({
  fetchShopBasicInfo: (...args: unknown[]) => fetchShopBasicInfo(...args),
}));

import { ensureTiktokApiManagedCatalog } from "../../../../app/server/adsCatalog/tiktokEnsureApiCatalog.server";

describe("ensureTiktokApiManagedCatalog", () => {
  beforeEach(() => {
    getTiktokCatalogCredential.mockReset();
    getTiktokCatalogPending.mockReset();
    setTiktokCatalogCredential.mockReset();
    clearTiktokCatalogPending.mockReset();
    createTiktokCatalog.mockReset();
    listAccessibleBcIds.mockReset();
    fetchShopBasicInfo.mockReset();
  });

  it("returns existing api_managed catalog without creating", async () => {
    getTiktokCatalogCredential.mockResolvedValue({
      accessToken: "tok",
      advertiserId: "adv",
      bcId: "bc",
      catalogId: "cat-api",
      catalogName: "Spark",
      bindingMode: "api_managed",
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
