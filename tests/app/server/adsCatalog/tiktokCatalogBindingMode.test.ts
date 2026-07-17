import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../app/server/common/outboundError.server", () => ({
  formatOutboundNetworkError: (e: unknown) =>
    e instanceof Error ? e.message : String(e),
}));

import {
  isShopifyOfficialCatalog,
  isShopifySyncedCatalogUploadError,
  pickAutoBindTiktokCatalog,
  resolveTiktokBindingMode,
  type TiktokCatalogInfo,
} from "../../../../app/server/adsCatalog/tiktokOAuth.server";
import {
  createTiktokCatalog,
  resolveTiktokCatalogRegion,
} from "../../../../app/server/adsCatalog/clients/tiktokCatalogClient.server";

function catalog(
  overrides: Partial<TiktokCatalogInfo> & Pick<TiktokCatalogInfo, "catalogId">,
): TiktokCatalogInfo {
  const base = {
    catalogId: overrides.catalogId,
    catalogName: overrides.catalogName,
    bcId: overrides.bcId ?? "bc-1",
    advertiserId: overrides.advertiserId ?? "adv-1",
    catalogType: overrides.catalogType,
    businessPlatform: overrides.businessPlatform,
    channel: overrides.channel,
    createSource: overrides.createSource,
  };
  return {
    ...base,
    isShopifyOfficial:
      overrides.isShopifyOfficial ?? isShopifyOfficialCatalog(base),
  };
}

describe("TikTok catalog binding mode helpers", () => {
  it("isShopifyOfficialCatalog detects shopify in name/platform", () => {
    expect(isShopifyOfficialCatalog({ catalogName: "My Shopify Catalog" })).toBe(true);
    expect(isShopifyOfficialCatalog({ businessPlatform: "SHOPIFY" })).toBe(true);
    expect(isShopifyOfficialCatalog({ catalogName: "Spark Catalog" })).toBe(false);
  });

  it("isShopifySyncedCatalogUploadError matches TikTok lock message", () => {
    expect(
      isShopifySyncedCatalogUploadError(
        "TikTok Catalog upload failed: HTTP 200 code=40002 Your catalog is synced from Shopify and cannot be modified via API.",
      ),
    ).toBe(true);
    expect(isShopifySyncedCatalogUploadError("network error")).toBe(false);
  });

  it("resolveTiktokBindingMode maps official vs api", () => {
    expect(resolveTiktokBindingMode({ catalogName: "Shopify US" })).toBe("shopify_official");
    expect(resolveTiktokBindingMode({ catalogName: "Spark Catalog" })).toBe("api_managed");
  });

  it("pickAutoBindTiktokCatalog prefers official when present", () => {
    const picked = pickAutoBindTiktokCatalog([
      catalog({ catalogId: "a", catalogName: "Spark" }),
      catalog({ catalogId: "b", catalogName: "Shopify Catalog" }),
    ]);
    expect(picked?.catalogId).toBe("b");
    expect(picked?.isShopifyOfficial).toBe(true);
  });

  it("pickAutoBindTiktokCatalog auto-binds single non-official", () => {
    const picked = pickAutoBindTiktokCatalog([
      catalog({ catalogId: "only", catalogName: "Spark Catalog" }),
    ]);
    expect(picked?.catalogId).toBe("only");
    expect(resolveTiktokBindingMode(picked!)).toBe("api_managed");
  });

  it("pickAutoBindTiktokCatalog returns null for multiple non-official", () => {
    expect(
      pickAutoBindTiktokCatalog([
        catalog({ catalogId: "a", catalogName: "A" }),
        catalog({ catalogId: "b", catalogName: "B" }),
      ]),
    ).toBeNull();
  });
});

describe("createTiktokCatalog", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolveTiktokCatalogRegion maps currency to region", () => {
    expect(resolveTiktokCatalogRegion("gbp")).toEqual({ currency: "GBP", regionCode: "GB" });
    expect(resolveTiktokCatalogRegion()).toEqual({ currency: "USD", regionCode: "US" });
  });

  it("posts catalog/create with ECOM and CLIENT channel", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ code: 0, data: { catalog_id: "999" } }),
    });

    const result = await createTiktokCatalog({
      accessToken: "tok",
      bcId: "bc-1",
      name: "Spark Catalog — Demo",
      currency: "USD",
    });

    expect(result).toEqual({ catalogId: "999", catalogName: "Spark Catalog — Demo" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/catalog/create/");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      bc_id: "bc-1",
      name: "Spark Catalog — Demo",
      catalog_type: "ECOM",
      catalog_conf: {
        currency: "USD",
        region_code: "US",
        channel: "CLIENT",
      },
    });
  });
});
