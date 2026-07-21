import { beforeEach, describe, expect, it, vi } from "vitest";

const getTiktokCatalogCredential = vi.hoisted(() => vi.fn());
const fetchShopBasicInfo = vi.hoisted(() => vi.fn());
const fetchTiktokCatalogConf = vi.hoisted(() => vi.fn());
const getTiktokBcPixelLinkedAdvertiserIds = vi.hoisted(() => vi.fn());
const getTiktokCatalogEventSourceBindings = vi.hoisted(() => vi.fn());

vi.mock("../../../../app/server/adsCatalog/credentialStore.server", () => ({
  getTiktokCatalogCredential: (...args: unknown[]) => getTiktokCatalogCredential(...args),
}));

vi.mock("../../../../app/server/shopify/fetchShopBasicInfo.server", () => ({
  fetchShopBasicInfo: (...args: unknown[]) => fetchShopBasicInfo(...args),
}));

vi.mock("../../../../app/server/adsCatalog/clients/tiktokCatalogClient.server", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../../app/server/adsCatalog/clients/tiktokCatalogClient.server")
    >();
  return {
    ...actual,
    fetchTiktokCatalogConf: (...args: unknown[]) => fetchTiktokCatalogConf(...args),
    getTiktokBcPixelLinkedAdvertiserIds: (...args: unknown[]) =>
      getTiktokBcPixelLinkedAdvertiserIds(...args),
    getTiktokCatalogEventSourceBindings: (...args: unknown[]) =>
      getTiktokCatalogEventSourceBindings(...args),
  };
});

import { diagnoseTiktokCatalogBind } from "../../../../app/server/adsCatalog/tiktokCatalogBindDiagnosis.server";

describe("diagnoseTiktokCatalogBind", () => {
  beforeEach(() => {
    getTiktokCatalogCredential.mockReset();
    fetchShopBasicInfo.mockReset();
    fetchTiktokCatalogConf.mockReset();
    getTiktokBcPixelLinkedAdvertiserIds.mockReset();
    getTiktokCatalogEventSourceBindings.mockReset();

    fetchShopBasicInfo.mockResolvedValue({
      currencyCode: "USD",
      countryCode: "US",
    });
  });

  it("returns not ready when credential is missing", async () => {
    getTiktokCatalogCredential.mockResolvedValue(null);

    const result = await diagnoseTiktokCatalogBind({
      shop: "demo.myshopify.com",
      admin: { graphql: vi.fn() },
    });

    expect(result.ready).toBe(false);
    expect(result.checks.map((c) => c.id)).toEqual(["connected"]);
  });

  it("flags missing catalog event source when pixel is not bound", async () => {
    getTiktokCatalogCredential.mockResolvedValue({
      accessToken: "tok",
      advertiserId: "adv-1",
      bcId: "bc-1",
      catalogId: "cat-1",
      catalogName: "Spark Catalog",
      bindingMode: "api_managed",
      pixelCode: "PX123",
    });
    fetchTiktokCatalogConf.mockResolvedValue({
      catalogId: "cat-1",
      catalogName: "Spark Catalog",
      channel: "CLIENT",
      currency: "USD",
      regionCode: "US",
      isShopifyOfficial: false,
    });
    getTiktokBcPixelLinkedAdvertiserIds.mockResolvedValue({
      ok: true,
      advertiserIds: ["adv-1"],
    });
    getTiktokCatalogEventSourceBindings.mockResolvedValue([]);

    const result = await diagnoseTiktokCatalogBind({
      shop: "demo.myshopify.com",
      admin: { graphql: vi.fn() },
    });

    expect(result.ready).toBe(false);
    expect(result.checks.find((c) => c.id === "catalog_eventsource")?.status).toBe("error");
    expect(result.checks.find((c) => c.id === "pixel_adv_link")?.status).toBe("ok");
  });

  it("flags pixel asset permission separately from missing link", async () => {
    getTiktokCatalogCredential.mockResolvedValue({
      accessToken: "tok",
      advertiserId: "adv-1",
      bcId: "bc-1",
      catalogId: "cat-1",
      catalogName: "Spark Catalog",
      bindingMode: "api_managed",
      pixelCode: "PX123",
    });
    fetchTiktokCatalogConf.mockResolvedValue({
      catalogId: "cat-1",
      catalogName: "Spark Catalog",
      channel: "CLIENT",
      currency: "USD",
      regionCode: "US",
      isShopifyOfficial: false,
      linkedAdvertiserIds: ["adv-1"],
    });
    getTiktokBcPixelLinkedAdvertiserIds.mockResolvedValue({
      ok: false,
      advertiserIds: [],
      errorCode: "PIXEL_ASSET_PERMISSION_DENIED",
      message: "You don't have permission to the asset(999)",
    });
    getTiktokCatalogEventSourceBindings.mockResolvedValue([]);

    const result = await diagnoseTiktokCatalogBind({
      shop: "demo.myshopify.com",
      admin: { graphql: vi.fn() },
    });

    expect(result.ready).toBe(false);
    expect(result.checks.find((c) => c.id === "pixel_adv_link_permission")?.status).toBe(
      "error",
    );
    expect(result.checks.find((c) => c.id === "pixel_adv_link")).toBeUndefined();
  });

  it("returns ready when catalog, pixel, and event source checks pass", async () => {
    getTiktokCatalogCredential.mockResolvedValue({
      accessToken: "tok",
      advertiserId: "adv-1",
      bcId: "bc-1",
      catalogId: "cat-1",
      catalogName: "Spark Catalog",
      bindingMode: "api_managed",
      pixelCode: "PX123",
    });
    fetchTiktokCatalogConf.mockResolvedValue({
      catalogId: "cat-1",
      catalogName: "Spark Catalog",
      channel: "CLIENT",
      currency: "USD",
      regionCode: "US",
      isShopifyOfficial: false,
      linkedAdvertiserIds: ["adv-1"],
    });
    getTiktokBcPixelLinkedAdvertiserIds.mockResolvedValue({
      ok: true,
      advertiserIds: ["adv-1"],
    });
    getTiktokCatalogEventSourceBindings.mockResolvedValue([{ pixelCode: "PX123" }]);

    const result = await diagnoseTiktokCatalogBind({
      shop: "demo.myshopify.com",
      admin: { graphql: vi.fn() },
    });

    expect(result.ready).toBe(true);
    expect(result.summaryStatus).toBe("ok");
    expect(result.checks.find((c) => c.id === "catalog_eventsource")?.status).toBe("ok");
  });
});
