import { describe, expect, it, vi } from "vitest";
import {
  completeMetaUnifiedOnboarding,
  META_UNIFIED_ADS_EMPTY,
  META_UNIFIED_CAPI_BLOCKED,
  META_UNIFIED_CATALOG_EMPTY,
  summarizeMetaUnifiedAuth,
  toMetaUnifiedAuthParams,
  type MetaUnifiedOnboardingDeps,
} from "../../../../app/server/adsCatalog/metaUnifiedOnboarding.server";

function createDeps(
  overrides: Partial<MetaUnifiedOnboardingDeps> = {},
): MetaUnifiedOnboardingDeps {
  return {
    getFacebookCatalogCredential: vi.fn().mockResolvedValue(null),
    setFacebookCatalogCredential: vi.fn().mockResolvedValue(undefined),
    setMetaCatalogPending: vi.fn().mockResolvedValue(undefined),
    clearMetaCatalogPending: vi.fn().mockResolvedValue(undefined),
    getMetaCatalogs: vi.fn().mockResolvedValue([]),
    getMetaAdsCredential: vi.fn().mockResolvedValue(null),
    setMetaAdsCredential: vi.fn().mockResolvedValue(undefined),
    setMetaAdsPending: vi.fn().mockResolvedValue(undefined),
    clearMetaAdsPending: vi.fn().mockResolvedValue(undefined),
    getMetaAdAccounts: vi.fn().mockResolvedValue([]),
    persistMetaCapiBisuOnboarding: vi.fn().mockResolvedValue({
      status: "saved",
      pixelId: "px_1",
      businessId: "biz_1",
    }),
    setMetaCapiPending: vi.fn().mockResolvedValue(undefined),
    clearMetaCapiPending: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const catalog = { catalogId: "cat_1", name: "Catalog 1", businessId: "biz_1" };
const adsAccount = { adAccountId: "act_1", name: "Ads 1", currencyCode: "USD" };

describe("summarizeMetaUnifiedAuth", () => {
  it("returns success when every capability is settled", () => {
    expect(
      summarizeMetaUnifiedAuth({
        catalog: { status: "success" },
        ads: { status: "select" },
        capi: { status: "success" },
      }),
    ).toEqual({ metaUnifiedAuth: "success" });
  });

  it("returns partial when any capability is incomplete", () => {
    expect(
      summarizeMetaUnifiedAuth({
        catalog: { status: "success" },
        ads: { status: "empty", reason: META_UNIFIED_ADS_EMPTY },
        capi: { status: "success" },
      }),
    ).toEqual({
      metaUnifiedAuth: "partial",
      reason: META_UNIFIED_ADS_EMPTY,
    });
  });

  it("returns error when nothing is settled", () => {
    expect(
      summarizeMetaUnifiedAuth({
        catalog: { status: "empty", reason: META_UNIFIED_CATALOG_EMPTY },
        ads: { status: "error", reason: "missing ads_read" },
        capi: { status: "blocked", reason: META_UNIFIED_CAPI_BLOCKED },
      }),
    ).toEqual({
      metaUnifiedAuth: "error",
      reason: `${META_UNIFIED_CATALOG_EMPTY}；missing ads_read；${META_UNIFIED_CAPI_BLOCKED}`,
    });
  });
});

describe("completeMetaUnifiedOnboarding", () => {
  it("binds a single catalog and a single ads account", async () => {
    const deps = createDeps({
      getMetaCatalogs: vi.fn().mockResolvedValue([catalog]),
      getMetaAdAccounts: vi.fn().mockResolvedValue([adsAccount]),
      getFacebookCatalogCredential: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValue({
          accessToken: "tok",
          catalogId: "cat_1",
          businessId: "biz_1",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
    });

    const result = await completeMetaUnifiedOnboarding({
      shop: "shop.myshopify.com",
      token: "tok",
      deps,
    });

    expect(result).toEqual({
      catalog: { status: "success" },
      ads: { status: "success" },
      capi: { status: "success" },
    });
    expect(deps.setFacebookCatalogCredential).toHaveBeenCalledOnce();
    expect(deps.setMetaAdsCredential).toHaveBeenCalledWith("shop.myshopify.com", {
      accessToken: "tok",
      adAccountId: "act_1",
      adAccountName: "Ads 1",
      currencyCode: "USD",
      availableAccounts: [{ id: "act_1", name: "Ads 1", formatted: "USD" }],
    });
    expect(toMetaUnifiedAuthParams(result)).toMatchObject({
      metaUnifiedAuth: "success",
      metaCatalog: "success",
      metaAds: "success",
      metaCapi: "success",
    });
  });

  it("puts multiple ads accounts into pending without failing catalog", async () => {
    const deps = createDeps({
      getMetaCatalogs: vi.fn().mockResolvedValue([catalog]),
      getMetaAdAccounts: vi.fn().mockResolvedValue([
        adsAccount,
        { adAccountId: "act_2", name: "Ads 2", currencyCode: "USD" },
      ]),
      getFacebookCatalogCredential: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValue({
          accessToken: "tok",
          catalogId: "cat_1",
          businessId: "biz_1",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
    });

    const result = await completeMetaUnifiedOnboarding({
      shop: "shop.myshopify.com",
      token: "tok",
      deps,
    });

    expect(result.catalog.status).toBe("success");
    expect(result.ads).toEqual({ status: "select" });
    expect(deps.setMetaAdsPending).toHaveBeenCalledOnce();
    expect(deps.setMetaAdsCredential).not.toHaveBeenCalled();
  });

  it("keeps catalog when ads listing fails", async () => {
    const deps = createDeps({
      getMetaCatalogs: vi.fn().mockResolvedValue([catalog]),
      getMetaAdAccounts: vi.fn().mockRejectedValue(new Error("(#200) Missing ads_read")),
      getFacebookCatalogCredential: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValue({
          accessToken: "tok",
          catalogId: "cat_1",
          businessId: "biz_1",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
    });

    const result = await completeMetaUnifiedOnboarding({
      shop: "shop.myshopify.com",
      token: "tok",
      deps,
    });

    expect(result.catalog.status).toBe("success");
    expect(result.ads).toEqual({
      status: "error",
      reason: "(#200) Missing ads_read",
    });
    expect(result.capi.status).toBe("success");
    expect(summarizeMetaUnifiedAuth(result).metaUnifiedAuth).toBe("partial");
  });

  it("records empty ads without throwing", async () => {
    const deps = createDeps({
      getMetaCatalogs: vi.fn().mockResolvedValue([catalog]),
      getMetaAdAccounts: vi.fn().mockResolvedValue([]),
      getFacebookCatalogCredential: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValue({
          accessToken: "tok",
          catalogId: "cat_1",
          businessId: "biz_1",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
    });

    const result = await completeMetaUnifiedOnboarding({
      shop: "shop.myshopify.com",
      token: "tok",
      deps,
    });

    expect(result.ads).toEqual({ status: "empty", reason: META_UNIFIED_ADS_EMPTY });
    expect(deps.setMetaAdsCredential).not.toHaveBeenCalled();
  });

  it("puts multiple catalogs into pending instead of failing the whole flow", async () => {
    const deps = createDeps({
      getMetaCatalogs: vi.fn().mockResolvedValue([
        catalog,
        { catalogId: "cat_2", name: "Catalog 2", businessId: "biz_1" },
      ]),
      getMetaAdAccounts: vi.fn().mockResolvedValue([adsAccount]),
    });

    const result = await completeMetaUnifiedOnboarding({
      shop: "shop.myshopify.com",
      token: "tok",
      deps,
    });

    expect(result.catalog.status).toBe("select");
    expect(result.ads.status).toBe("success");
    expect(result.capi).toEqual({
      status: "blocked",
      reason: META_UNIFIED_CAPI_BLOCKED,
    });
    expect(deps.setMetaCatalogPending).toHaveBeenCalledOnce();
    expect(deps.setFacebookCatalogCredential).not.toHaveBeenCalled();
  });
});
