import { beforeEach, describe, expect, it, vi } from "vitest";

const getFacebookCatalogCredential = vi.fn();
const getMetaAdsCredential = vi.fn();
const getGoogleMerchantCredential = vi.fn();
const getGoogleAdsCredential = vi.fn();
const getTiktokCatalogCredential = vi.fn();

vi.mock("~/server/adsCatalog/credentialStore.server", () => ({
  getFacebookCatalogCredential,
  getMetaAdsCredential,
  getGoogleMerchantCredential,
  getGoogleAdsCredential,
  getTiktokCatalogCredential,
}));

const { buildAdsHealthChecks } = await import("~/server/adsCatalog/adsHealth.server");

const SHOP = "s.myshopify.com";

async function checkFor(key: string) {
  const checks = await buildAdsHealthChecks(SHOP);
  const found = checks.find((item) => item.key === key);
  if (!found) throw new Error(`missing check ${key}`);
  return found;
}

beforeEach(() => {
  getFacebookCatalogCredential.mockReset().mockResolvedValue(null);
  getMetaAdsCredential.mockReset().mockResolvedValue(null);
  getGoogleMerchantCredential.mockReset().mockResolvedValue(null);
  getGoogleAdsCredential.mockReset().mockResolvedValue(null);
  getTiktokCatalogCredential.mockReset().mockResolvedValue(null);
});

describe("buildAdsHealthChecks", () => {
  it("marks everything as missing when nothing is connected", async () => {
    const checks = await buildAdsHealthChecks(SHOP);
    expect(checks).toHaveLength(9);
    expect(checks.every((item) => item.state === "missing")).toBe(true);
  });

  it("never leaks credential secrets into the result", async () => {
    getMetaAdsCredential.mockResolvedValue({
      accessToken: "SECRET_TOKEN",
      adAccountId: "act_1",
      adAccountName: "Main",
      updatedAt: "2026-08-01",
    });
    getTiktokCatalogCredential.mockResolvedValue({
      accessToken: "SECRET_TOKEN",
      eventsApiAccessToken: "SECRET_EVENTS_TOKEN",
      advertiserId: "adv1",
      catalogId: "cat1",
      catalogName: "Main catalog",
      bindingMode: "api_managed",
      pixelCode: "PIXEL1",
      eventsApiEnabled: true,
      updatedAt: "2026-08-01",
    });

    const serialized = JSON.stringify(await buildAdsHealthChecks(SHOP));
    expect(serialized).not.toContain("SECRET_TOKEN");
    expect(serialized).not.toContain("SECRET_EVENTS_TOKEN");
  });

  it("flags a Merchant account without a primary data source", async () => {
    getGoogleMerchantCredential.mockResolvedValue({
      accessToken: "t",
      merchantId: "5120",
      updatedAt: "2026-08-01",
    });
    const check = await checkFor("gmcDataSource");
    expect(check.state).toBe("warning");
    expect(check.detailCode).toBe("missingDataSource");
  });

  it("reports the data source scope once it exists", async () => {
    getGoogleMerchantCredential.mockResolvedValue({
      accessToken: "t",
      merchantId: "5120",
      dataSourceName: "accounts/5120/dataSources/1",
      dataSourceFeedLabel: "US",
      dataSourceContentLanguage: "en",
      updatedAt: "2026-08-01",
    });
    const check = await checkFor("gmcDataSource");
    expect(check.state).toBe("ok");
    expect(check.reference).toBe("US · en");
  });

  it("only asks for a link probe when both Google sides are connected", async () => {
    getGoogleMerchantCredential.mockResolvedValue({
      accessToken: "t",
      merchantId: "5120",
      updatedAt: "2026-08-01",
    });
    expect((await checkFor("gmcAdsLink")).state).toBe("missing");

    getGoogleAdsCredential.mockResolvedValue({
      accessToken: "t",
      customerId: "482",
      updatedAt: "2026-08-01",
    });
    const check = await checkFor("gmcAdsLink");
    expect(check.state).toBe("unknown");
    expect(check.detailCode).toBe("needsProbe");
  });

  it("warns when remarketing metafield sync failed", async () => {
    getGoogleAdsCredential.mockResolvedValue({
      accessToken: "t",
      customerId: "482",
      remarketing: {
        tagId: "AW-123",
        source: "auto",
        confirmedAt: "2026-08-01",
        enabledEvents: [],
        enabledFieldGroups: [],
        customPixelConfirmedAt: "2026-08-01",
        metafieldSync: { status: "failed", updatedAt: "2026-08-01", error: "boom" },
      },
      updatedAt: "2026-08-01",
    });
    const check = await checkFor("googleRemarketing");
    expect(check.state).toBe("warning");
    expect(check.detailCode).toBe("metafieldFailed");
    expect(check.reference).toBe("AW-123");
  });

  it("warns while the purchase custom pixel is unconfirmed", async () => {
    getGoogleAdsCredential.mockResolvedValue({
      accessToken: "t",
      customerId: "482",
      remarketing: {
        tagId: "AW-123",
        source: "auto",
        confirmedAt: "2026-08-01",
        enabledEvents: [],
        enabledFieldGroups: [],
        metafieldSync: { status: "synced", updatedAt: "2026-08-01" },
      },
      updatedAt: "2026-08-01",
    });
    expect((await checkFor("googleRemarketing")).detailCode).toBe("purchaseUnconfirmed");
  });

  it("prioritizes the TikTok test event code over the Events API state", async () => {
    getTiktokCatalogCredential.mockResolvedValue({
      accessToken: "t",
      advertiserId: "adv1",
      catalogId: "cat1",
      bindingMode: "api_managed",
      pixelCode: "PIXEL1",
      eventsApiEnabled: true,
      eventsApiAccessToken: "x",
      testEventCode: "TEST123",
      updatedAt: "2026-08-01",
    });
    const check = await checkFor("tiktokPixel");
    expect(check.state).toBe("warning");
    expect(check.detailCode).toBe("testModeOn");
  });

  it("distinguishes the TikTok official catalog from a Spark-managed one", async () => {
    getTiktokCatalogCredential.mockResolvedValue({
      accessToken: "t",
      advertiserId: "adv1",
      catalogId: "cat1",
      catalogName: "Official",
      bindingMode: "shopify_official",
      updatedAt: "2026-08-01",
    });
    const check = await checkFor("tiktokCatalog");
    expect(check.state).toBe("ok");
    expect(check.detailCode).toBe("shopifyOfficial");
  });
});
