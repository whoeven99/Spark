import { beforeEach, describe, expect, it, vi } from "vitest";

const getFacebookCatalogCredential = vi.hoisted(() => vi.fn());
const getMetaAdsCredential = vi.hoisted(() => vi.fn());
const listMetaAdAccountPixels = vi.hoisted(() => vi.fn());
const listMetaBusinessPixels = vi.hoisted(() => vi.fn());
const getMetaAdAccounts = vi.hoisted(() => vi.fn());

vi.mock("../../../../app/server/adsCatalog/credentialStore.server", () => ({
  getFacebookCatalogCredential: (...args: unknown[]) => getFacebookCatalogCredential(...args),
  getMetaAdsCredential: (...args: unknown[]) => getMetaAdsCredential(...args),
}));

vi.mock("../../../../app/server/adsCatalog/clients/facebookGraphClient.server", () => ({
  listMetaAdAccountPixels: (...args: unknown[]) => listMetaAdAccountPixels(...args),
  listMetaBusinessPixels: (...args: unknown[]) => listMetaBusinessPixels(...args),
}));

vi.mock("../../../../app/server/adsCatalog/metaOAuth.server", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../../app/server/adsCatalog/metaOAuth.server")
    >();
  return {
    ...actual,
    getMetaAdAccounts: (...args: unknown[]) => getMetaAdAccounts(...args),
  };
});

import { listMetaCatalogPixels } from "../../../../app/server/adsCatalog/metaPixelConfig.server";

describe("listMetaCatalogPixels", () => {
  beforeEach(() => {
    getFacebookCatalogCredential.mockReset();
    getMetaAdsCredential.mockReset();
    listMetaAdAccountPixels.mockReset();
    listMetaBusinessPixels.mockReset();
    getMetaAdAccounts.mockReset();
  });

  it("uses meta_ads credential first", async () => {
    getMetaAdsCredential.mockResolvedValue({
      accessToken: "ads-token",
      adAccountId: "act_1",
      adAccountName: "Main",
      availableAccounts: [{ id: "act_1", name: "Main" }],
    });
    getFacebookCatalogCredential.mockResolvedValue({
      accessToken: "cat",
      catalogId: "c1",
      pixelId: "999",
    });
    listMetaAdAccountPixels.mockResolvedValue([
      { pixelId: "111", pixelName: "Pixel A" },
    ]);

    const result = await listMetaCatalogPixels({ shop: "s.myshopify.com" });

    expect(result.pixelSource).toBe("meta_ads");
    expect(result.pixels).toEqual([{ pixelId: "111", pixelName: "Pixel A" }]);
    expect(result.adAccountId).toBe("act_1");
    expect(result.boundPixelId).toBe("999");
    expect(listMetaAdAccountPixels).toHaveBeenCalledWith({
      accessToken: "ads-token",
      adAccountId: "act_1",
    });
  });

  it("falls back to business pixels from catalog credential", async () => {
    getMetaAdsCredential.mockResolvedValue(null);
    getFacebookCatalogCredential.mockResolvedValue({
      accessToken: "cat-token",
      catalogId: "c1",
      businessId: "biz_1",
    });
    listMetaBusinessPixels.mockResolvedValue([
      { pixelId: "222", pixelName: "Biz Pixel" },
    ]);

    const result = await listMetaCatalogPixels({ shop: "s.myshopify.com" });

    expect(result.pixelSource).toBe("business");
    expect(result.pixels).toEqual([{ pixelId: "222", pixelName: "Biz Pixel" }]);
    expect(listMetaBusinessPixels).toHaveBeenCalledWith({
      accessToken: "cat-token",
      businessId: "biz_1",
    });
  });

  it("marks needsMetaAdsConnect when catalog cannot list ad account pixels", async () => {
    getMetaAdsCredential.mockResolvedValue(null);
    getFacebookCatalogCredential.mockResolvedValue({
      accessToken: "cat-token",
      catalogId: "c1",
    });
    listMetaBusinessPixels.mockResolvedValue([]);
    getMetaAdAccounts.mockRejectedValue(new Error("Missing permissions"));

    const result = await listMetaCatalogPixels({ shop: "s.myshopify.com" });

    expect(result.needsMetaAdsConnect).toBe(true);
    expect(result.pixels).toEqual([]);
    expect(result.listError).toContain("Missing permissions");
  });
});
