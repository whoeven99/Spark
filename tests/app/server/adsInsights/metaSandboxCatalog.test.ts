import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFacebookCatalogCredential: vi.fn(),
  getMetaCatalogs: vi.fn(),
  metaGet: vi.fn(),
}));

vi.mock("~/server/adsCatalog/credentialStore.server", () => ({
  getFacebookCatalogCredential: mocks.getFacebookCatalogCredential,
}));

vi.mock("~/server/adsCatalog/metaOAuth.server", () => ({
  getMetaCatalogs: mocks.getMetaCatalogs,
}));

vi.mock("~/server/adsInsights/metaSandbox.server", () => ({
  metaGet: mocks.metaGet,
  normalizeAdAccountId: (id: string) => (id.startsWith("act_") ? id : `act_${id}`),
  readMetaSandboxEnv: (name: string) => process.env[name] ?? "",
}));

import { resolveSandboxCatalogContext } from "~/server/adsInsights/metaSandboxCatalog.server";

describe("resolveSandboxCatalogContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.META_SANDBOX_PRODUCT_CATALOG_ID;
    delete process.env.META_SANDBOX_PRODUCT_SET_ID;
  });

  it("uses shop meta catalog credential when sandbox token has no business access", async () => {
    mocks.getFacebookCatalogCredential.mockResolvedValue({
      accessToken: "catalog-token",
      catalogId: "cat-shop-1",
    });
    mocks.metaGet.mockResolvedValue({
      data: [{ id: "set-1", name: "All Products" }],
    });

    const result = await resolveSandboxCatalogContext({
      sandboxAccessToken: "sandbox-token",
      adAccountId: "123",
      shop: "demo.myshopify.com",
    });

    expect(result).toEqual({
      catalogId: "cat-shop-1",
      productSetId: "set-1",
      catalogAccessToken: "catalog-token",
      source: "shop_catalog_credential",
    });
    expect(mocks.getFacebookCatalogCredential).toHaveBeenCalledWith("demo.myshopify.com");
  });

  it("falls back to env catalog id", async () => {
    process.env.META_SANDBOX_PRODUCT_CATALOG_ID = "cat-env";
    process.env.META_SANDBOX_PRODUCT_SET_ID = "set-env";
    mocks.getFacebookCatalogCredential.mockResolvedValue(null);

    const result = await resolveSandboxCatalogContext({
      sandboxAccessToken: "sandbox-token",
      adAccountId: "123",
      shop: "demo.myshopify.com",
    });

    expect(result).toEqual({
      catalogId: "cat-env",
      productSetId: "set-env",
      catalogAccessToken: "sandbox-token",
      source: "env",
    });
  });
});
