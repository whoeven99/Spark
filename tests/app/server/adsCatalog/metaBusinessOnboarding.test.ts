import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../app/server/adsCatalog/credentialStore.server", () => ({
  clearMetaBusinessPending: vi.fn(),
  getFacebookCatalogCredential: vi.fn().mockResolvedValue(null),
  setFacebookCatalogCredential: vi.fn(),
  setMetaAdsCredential: vi.fn(),
  setMetaBusinessPending: vi.fn(),
  getMetaBusinessPending: vi.fn(),
}));

vi.mock("../../../../app/server/adsCatalog/metaCapiOnboarding.server", () => ({
  fetchMetaBisuClientBusinessId: vi.fn().mockResolvedValue("biz-1"),
}));

vi.mock("../../../../app/server/adsCatalog/clients/facebookGraphClient.server", () => ({
  listMetaBusinessPixels: vi.fn().mockResolvedValue([{ pixelId: "px-1", pixelName: "Main" }]),
  listMetaAdAccountPixels: vi.fn().mockResolvedValue([]),
}));

import {
  clearMetaBusinessPending,
  setFacebookCatalogCredential,
  setMetaAdsCredential,
  setMetaBusinessPending,
  getMetaBusinessPending,
} from "../../../../app/server/adsCatalog/credentialStore.server";
import {
  confirmMetaBusinessPendingSelection,
  discoverMetaBusinessAssets,
  isMetaBusinessLoginConfigured,
  persistMetaBusinessOnboarding,
  saveMetaBusinessCredentials,
} from "../../../../app/server/adsCatalog/metaBusinessOnboarding.server";
import {
  buildMetaBusinessAuthUrl,
  resolveMetaBusinessLoginConfigId,
} from "../../../../app/server/adsCatalog/metaOAuth.server";

describe("meta Business Login onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("buildMetaBusinessAuthUrl uses config_id without scope", () => {
    const url = buildMetaBusinessAuthUrl({
      appId: "app-123",
      state: "signed-state",
      redirectUri: "https://example.com/ads/meta-business/callback",
      configId: "cfg-789",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("client_id")).toBe("app-123");
    expect(parsed.searchParams.get("config_id")).toBe("cfg-789");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("scope")).toBeNull();
  });

  it("resolveMetaBusinessLoginConfigId prefers META_BUSINESS_LOGIN_CONFIG_ID", () => {
    const prevBusiness = process.env.META_BUSINESS_LOGIN_CONFIG_ID;
    const prevCapi = process.env.META_CAPI_LOGIN_CONFIG_ID;
    process.env.META_BUSINESS_LOGIN_CONFIG_ID = " business-cfg ";
    process.env.META_CAPI_LOGIN_CONFIG_ID = "capi-cfg";
    expect(resolveMetaBusinessLoginConfigId()).toBe("business-cfg");
    expect(isMetaBusinessLoginConfigured()).toBe(true);
    if (prevBusiness === undefined) delete process.env.META_BUSINESS_LOGIN_CONFIG_ID;
    else process.env.META_BUSINESS_LOGIN_CONFIG_ID = prevBusiness;
    if (prevCapi === undefined) delete process.env.META_CAPI_LOGIN_CONFIG_ID;
    else process.env.META_CAPI_LOGIN_CONFIG_ID = prevCapi;
  });

  it("saveMetaBusinessCredentials writes catalog and ads with same BISU token", async () => {
    const prev = process.env.META_BUSINESS_LOGIN_CONFIG_ID;
    process.env.META_BUSINESS_LOGIN_CONFIG_ID = "cfg-1";

    await saveMetaBusinessCredentials({
      shop: "shop.myshopify.com",
      bisuToken: "bisu-token",
      businessId: "biz-1",
      catalogId: "cat-1",
      adAccountId: "act_1",
      pixelId: "px-1",
    });

    expect(setFacebookCatalogCredential).toHaveBeenCalledWith(
      "shop.myshopify.com",
      expect.objectContaining({
        accessToken: "bisu-token",
        capiAccessToken: "bisu-token",
        capiTokenType: "bisu",
        catalogId: "cat-1",
        pixelId: "px-1",
      }),
    );
    expect(setMetaAdsCredential).toHaveBeenCalledWith(
      "shop.myshopify.com",
      expect.objectContaining({
        accessToken: "bisu-token",
        adAccountId: "act_1",
      }),
    );
    expect(clearMetaBusinessPending).toHaveBeenCalledWith("shop.myshopify.com");

    if (prev === undefined) delete process.env.META_BUSINESS_LOGIN_CONFIG_ID;
    else process.env.META_BUSINESS_LOGIN_CONFIG_ID = prev;
  });

  it("persistMetaBusinessOnboarding auto-saves when each asset list has one item", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/owned_product_catalogs")) {
        return new Response(JSON.stringify({ data: [{ id: "cat-1", name: "Catalog" }] }));
      }
      if (url.includes("/client_product_catalogs")) {
        return new Response(JSON.stringify({ data: [] }));
      }
      if (url.includes("/owned_ad_accounts")) {
        return new Response(
          JSON.stringify({ data: [{ id: "act_1", name: "Ads", currency: "USD" }] }),
        );
      }
      return new Response(JSON.stringify({ data: [] }));
    });

    const result = await persistMetaBusinessOnboarding({
      shop: "shop.myshopify.com",
      bisuToken: "bisu-token",
    });

    expect(result).toEqual({
      status: "saved",
      catalogId: "cat-1",
      adAccountId: "act_1",
      pixelId: "px-1",
    });
    expect(setFacebookCatalogCredential).toHaveBeenCalled();
    expect(setMetaBusinessPending).not.toHaveBeenCalled();

    fetchMock.mockRestore();
  });

  it("persistMetaBusinessOnboarding returns select when multiple catalogs", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/owned_product_catalogs")) {
        return new Response(
          JSON.stringify({
            data: [
              { id: "cat-1", name: "A" },
              { id: "cat-2", name: "B" },
            ],
          }),
        );
      }
      if (url.includes("/client_product_catalogs")) {
        return new Response(JSON.stringify({ data: [] }));
      }
      if (url.includes("/owned_ad_accounts")) {
        return new Response(
          JSON.stringify({ data: [{ id: "act_1", name: "Ads", currency: "USD" }] }),
        );
      }
      return new Response(JSON.stringify({ data: [] }));
    });

    const result = await persistMetaBusinessOnboarding({
      shop: "shop.myshopify.com",
      bisuToken: "bisu-token",
    });

    expect(result.status).toBe("select");
    expect(setMetaBusinessPending).toHaveBeenCalled();
    expect(setFacebookCatalogCredential).not.toHaveBeenCalled();

    fetchMock.mockRestore();
  });

  it("confirmMetaBusinessPendingSelection saves chosen assets", async () => {
    vi.mocked(getMetaBusinessPending).mockResolvedValue({
      accessToken: "bisu-token",
      businessId: "biz-1",
      catalogs: [{ id: "cat-1", name: "Catalog", businessId: "biz-1" }],
      adAccounts: [{ id: "act_1", name: "Ads", formatted: "USD" }],
      pixels: [{ id: "px-1", name: "Main", businessId: "biz-1" }],
    });

    await confirmMetaBusinessPendingSelection({
      shop: "shop.myshopify.com",
      catalogId: "cat-1",
      adAccountId: "act_1",
      pixelId: "px-1",
    });

    expect(setFacebookCatalogCredential).toHaveBeenCalledWith(
      "shop.myshopify.com",
      expect.objectContaining({ catalogId: "cat-1", pixelId: "px-1" }),
    );
  });

  it("discoverMetaBusinessAssets aggregates catalogs, ad accounts, and pixels", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/owned_product_catalogs")) {
        return new Response(JSON.stringify({ data: [{ id: "cat-1", name: "Catalog" }] }));
      }
      if (url.includes("/client_product_catalogs")) {
        return new Response(JSON.stringify({ data: [] }));
      }
      if (url.includes("/owned_ad_accounts")) {
        return new Response(
          JSON.stringify({ data: [{ id: "act_1", name: "Ads", currency: "USD" }] }),
        );
      }
      return new Response(JSON.stringify({ data: [] }));
    });

    const assets = await discoverMetaBusinessAssets({ accessToken: "bisu-token" });
    expect(assets.businessId).toBe("biz-1");
    expect(assets.catalogs).toHaveLength(1);
    expect(assets.adAccounts).toHaveLength(1);
    expect(assets.pixels).toHaveLength(1);

    fetchMock.mockRestore();
  });
});
