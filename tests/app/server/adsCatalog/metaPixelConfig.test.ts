import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getFacebookCatalogCredential = vi.hoisted(() => vi.fn());
const getMetaAdsCredential = vi.hoisted(() => vi.fn());
const setFacebookCatalogCredential = vi.hoisted(() => vi.fn());
const trackMetaPixelEvent = vi.hoisted(() => vi.fn());
const fetchMetaPixelCapiAccessToken = vi.hoisted(() => vi.fn());
const resolveMetaOAuthClient = vi.hoisted(() => vi.fn());

vi.mock("../../../../app/server/adsCatalog/credentialStore.server", () => ({
  getFacebookCatalogCredential: (...args: unknown[]) => getFacebookCatalogCredential(...args),
  getMetaAdsCredential: (...args: unknown[]) => getMetaAdsCredential(...args),
  setFacebookCatalogCredential: (...args: unknown[]) => setFacebookCatalogCredential(...args),
}));

vi.mock("../../../../app/server/adsCatalog/clients/metaConversionsApiClient.server", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../../../app/server/adsCatalog/clients/metaConversionsApiClient.server")
  >();
  return {
    ...actual,
    trackMetaPixelEvent: (...args: unknown[]) => trackMetaPixelEvent(...args),
  };
});

vi.mock("../../../../app/server/adsCatalog/clients/metaCapiTokenClient.server", () => ({
  fetchMetaPixelCapiAccessToken: (...args: unknown[]) => fetchMetaPixelCapiAccessToken(...args),
}));

vi.mock("../../../../app/server/adsCatalog/metaOAuth.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../app/server/adsCatalog/metaOAuth.server")>();
  return {
    ...actual,
    resolveMetaOAuthClient: (...args: unknown[]) => resolveMetaOAuthClient(...args),
    getMetaAdAccounts: vi.fn().mockResolvedValue([]),
  };
});

vi.mock("../../../../app/server/adsCatalog/clients/facebookGraphClient.server", () => ({
  listMetaAdAccountPixels: vi.fn().mockResolvedValue([]),
  listMetaBusinessPixels: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../../../app/lib/storefrontPixelCollection", () => ({
  isStorefrontPixelCollectionEnabled: () => true,
}));

import { MetaCapiTrackError } from "../../../../app/server/adsCatalog/clients/metaConversionsApiClient.server";
import {
  formatMetaCapiTokenForLog,
  maybeTrackMetaPurchase,
  saveMetaPixelConfig,
  shouldLogFullMetaCapiToken,
  testMetaServerEvents,
  trackMetaStorefrontTestEvent,
} from "../../../../app/server/adsCatalog/metaPixelConfig.server";

const admin = {
  graphql: vi.fn().mockResolvedValue({
    json: async () => ({ data: { shop: { id: "gid://shopify/Shop/1" } } }),
  }),
};

describe("maybeTrackMetaPurchase", () => {
  beforeEach(() => {
    getFacebookCatalogCredential.mockReset();
    getMetaAdsCredential.mockReset();
    getMetaAdsCredential.mockResolvedValue(null);
    trackMetaPixelEvent.mockReset();
    trackMetaPixelEvent.mockResolvedValue(undefined);
  });

  it("skips when CAPI disabled or token missing", async () => {
    getFacebookCatalogCredential.mockResolvedValue({
      accessToken: "oauth",
      catalogId: "cat",
      pixelId: "123",
      capiEnabled: false,
      capiAccessToken: "tok",
      enabledEvents: ["Purchase"],
    });
    expect(await maybeTrackMetaPurchase({ shop: "s.myshopify.com", orderId: "1" })).toEqual({
      sent: false,
      reason: "capi_disabled",
    });

    getFacebookCatalogCredential.mockResolvedValue({
      accessToken: "catalog-oauth",
      catalogId: "cat",
      pixelId: "123",
      capiEnabled: true,
      enabledEvents: ["Purchase"],
    });
    expect(await maybeTrackMetaPurchase({ shop: "s.myshopify.com", orderId: "1" })).toEqual({
      sent: false,
      reason: "no_capi_token",
    });
  });

  it("sends Purchase when enabled", async () => {
    getFacebookCatalogCredential.mockResolvedValue({
      accessToken: "oauth",
      catalogId: "cat",
      pixelId: "123456",
      capiEnabled: true,
      capiAccessToken: "capi-tok",
      enabledEvents: ["Purchase", "ViewContent"],
    });

    const result = await maybeTrackMetaPurchase({
      shop: "s.myshopify.com",
      orderId: "99",
      orderName: "1001",
      value: 42.5,
      currency: "USD",
      email: "buyer@example.com",
    });

    expect(result).toEqual({ sent: true });
    expect(trackMetaPixelEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        pixelId: "123456",
        capiAccessToken: "capi-tok",
        eventName: "Purchase",
        eventId: "1001",
        email: "buyer@example.com",
        customData: { value: 42.5, currency: "USD" },
      }),
    );
  });

  it("refreshes expired CAPI token and retries Purchase", async () => {
    getFacebookCatalogCredential.mockResolvedValue({
      accessToken: "catalog-oauth",
      catalogId: "cat",
      businessId: "biz_1",
      pixelId: "123456",
      capiEnabled: true,
      capiAccessToken: "stale-token",
      enabledEvents: ["Purchase"],
    });
    getMetaAdsCredential.mockResolvedValue({
      accessToken: "meta-ads-oauth",
      adAccountId: "act_1",
    });
    resolveMetaOAuthClient.mockReturnValue({
      appId: "app-id",
      appSecret: "app-secret",
    });
    fetchMetaPixelCapiAccessToken.mockResolvedValue("refreshed-token");
    setFacebookCatalogCredential.mockResolvedValue(undefined);

    trackMetaPixelEvent
      .mockRejectedValueOnce(
        new MetaCapiTrackError("expired", {
          httpStatus: 401,
          errorCode: 190,
          errorType: "OAuthException",
        }),
      )
      .mockResolvedValueOnce(undefined);

    const result = await maybeTrackMetaPurchase({
      shop: "s.myshopify.com",
      orderId: "99",
      orderName: "1001",
      value: 10,
      currency: "USD",
    });

    expect(result).toEqual({ sent: true });
    expect(fetchMetaPixelCapiAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({
        shop: "s.myshopify.com",
        pixelId: "123456",
        businessId: "biz_1",
      }),
    );
    expect(setFacebookCatalogCredential).toHaveBeenCalledWith(
      "s.myshopify.com",
      expect.objectContaining({ capiAccessToken: "refreshed-token" }),
    );
    expect(trackMetaPixelEvent).toHaveBeenCalledTimes(2);
    expect(trackMetaPixelEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        capiAccessToken: "refreshed-token",
        eventName: "Purchase",
      }),
    );
  });
});

describe("saveMetaPixelConfig", () => {
  beforeEach(() => {
    getFacebookCatalogCredential.mockReset();
    getMetaAdsCredential.mockReset();
    setFacebookCatalogCredential.mockReset();
    fetchMetaPixelCapiAccessToken.mockReset();
    resolveMetaOAuthClient.mockReset();
    getMetaAdsCredential.mockResolvedValue({
      accessToken: "meta-ads-oauth",
      adAccountId: "act_1",
    });
    resolveMetaOAuthClient.mockReturnValue({
      appId: "app-id",
      appSecret: "app-secret",
    });
    fetchMetaPixelCapiAccessToken.mockResolvedValue("auto-capi-token");
    setFacebookCatalogCredential.mockResolvedValue(undefined);
  });

  it("auto-fetches pixel CAPI token when selecting pixel with OAuth", async () => {
    getFacebookCatalogCredential.mockResolvedValue({
      accessToken: "catalog-oauth",
      catalogId: "cat",
      businessId: "biz_1",
      pixelId: "",
      capiEnabled: true,
      enabledEvents: ["Purchase"],
    });

    const result = await saveMetaPixelConfig({
      shop: "demo.myshopify.com",
      admin: admin as never,
      pixelId: "1001680191617713",
      capiEnabled: true,
      enabledEvents: ["Purchase"],
    });

    expect(fetchMetaPixelCapiAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({
        shop: "demo.myshopify.com",
        pixelId: "1001680191617713",
        businessId: "biz_1",
        oauthAccessToken: "meta-ads-oauth",
        appId: "app-id",
        appSecret: "app-secret",
      }),
    );
    expect(setFacebookCatalogCredential).toHaveBeenCalledWith(
      "demo.myshopify.com",
      expect.objectContaining({
        pixelId: "1001680191617713",
        capiAccessToken: "auto-capi-token",
      }),
    );
    expect(result.hasCapiAccessToken).toBe(true);
    expect(result).not.toHaveProperty("capiAccessToken");
  });

  it("force-fetches CAPI token on switch binding even when pixel and token unchanged", async () => {
    getFacebookCatalogCredential.mockResolvedValue({
      accessToken: "catalog-oauth",
      catalogId: "cat",
      businessId: "biz_1",
      pixelId: "1001680191617713",
      capiAccessToken: "stale-token",
      capiEnabled: true,
      enabledEvents: ["Purchase"],
    });

    const result = await saveMetaPixelConfig({
      shop: "demo.myshopify.com",
      admin: admin as never,
      pixelId: "1001680191617713",
      capiEnabled: true,
      enabledEvents: ["Purchase"],
      forceFetchCapiToken: true,
    });

    expect(fetchMetaPixelCapiAccessToken).toHaveBeenCalled();
    expect(result.hasCapiAccessToken).toBe(true);
    expect(result).not.toHaveProperty("capiAccessToken");
  });
});

describe("trackMetaStorefrontTestEvent", () => {
  beforeEach(() => {
    getFacebookCatalogCredential.mockReset();
    getMetaAdsCredential.mockReset();
    getMetaAdsCredential.mockResolvedValue(null);
    trackMetaPixelEvent.mockReset();
    trackMetaPixelEvent.mockResolvedValue(undefined);
  });

  it("requires test mode", async () => {
    getFacebookCatalogCredential.mockResolvedValue({
      accessToken: "oauth",
      catalogId: "cat",
      pixelId: "123",
      capiEnabled: true,
      capiAccessToken: "tok",
      enabledEvents: ["ViewContent"],
    });
    expect(
      await trackMetaStorefrontTestEvent({
        shop: "s.myshopify.com",
        event: "ViewContent",
      }),
    ).toEqual({ sent: false, reason: "test_mode_off" });
  });

  it("sends when test mode on", async () => {
    getFacebookCatalogCredential.mockResolvedValue({
      accessToken: "oauth",
      catalogId: "cat",
      pixelId: "123",
      capiEnabled: true,
      capiAccessToken: "tok",
      testEventCode: "TEST123",
      enabledEvents: ["ViewContent"],
    });

    const result = await trackMetaStorefrontTestEvent({
      shop: "s.myshopify.com",
      event: "ViewContent",
      eventId: "evt-1",
      pageUrl: "https://s.myshopify.com/products/x",
    });

    expect(result).toEqual({ sent: true });
    expect(trackMetaPixelEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "ViewContent",
        testEventCode: "TEST123",
        eventSourceUrl: "https://s.myshopify.com/products/x",
        email: "spark-capi-test@s.myshopify.com",
      }),
    );
  });
});

describe("testMetaServerEvents", () => {
  beforeEach(() => {
    getFacebookCatalogCredential.mockReset();
    getMetaAdsCredential.mockReset();
    getMetaAdsCredential.mockResolvedValue({
      accessToken: "meta-ads-oauth",
      adAccountId: "act_1",
    });
    resolveMetaOAuthClient.mockReset();
    resolveMetaOAuthClient.mockReturnValue({
      appId: "app-id",
      appSecret: "app-secret",
    });
    fetchMetaPixelCapiAccessToken.mockReset();
    fetchMetaPixelCapiAccessToken.mockResolvedValue("fresh-token-for-pixel");
    trackMetaPixelEvent.mockReset();
    trackMetaPixelEvent.mockResolvedValue(undefined);
  });

  it("uses stored capi token for test events when available", async () => {
    getFacebookCatalogCredential.mockResolvedValue({
      accessToken: "oauth",
      catalogId: "cat",
      businessId: "biz_1",
      pixelId: "123456",
      capiAccessToken: "stale-token",
      enabledEvents: ["Purchase"],
    });

    await testMetaServerEvents({
      shop: "demo.myshopify.com",
      testEventCode: "TEST1495",
      pixelId: "999888",
      clientIpAddress: "203.0.113.10",
      clientUserAgent: "Mozilla/5.0",
    });

    expect(fetchMetaPixelCapiAccessToken).not.toHaveBeenCalled();
    expect(trackMetaPixelEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        pixelId: "999888",
        capiAccessToken: "stale-token",
        eventName: "Purchase",
        testEventCode: "TEST1495",
        email: "spark-capi-test@demo.myshopify.com",
        clientIpAddress: "203.0.113.10",
        clientUserAgent: "Mozilla/5.0",
        eventSourceUrl: "https://demo.myshopify.com",
      }),
    );
  });

  it("uses explicit manual token without fetching", async () => {
    getFacebookCatalogCredential.mockResolvedValue({
      accessToken: "oauth",
      catalogId: "cat",
      businessId: "biz_1",
      pixelId: "123456",
      capiAccessToken: "stale-token",
      enabledEvents: ["Purchase"],
    });

    await testMetaServerEvents({
      shop: "demo.myshopify.com",
      testEventCode: "TEST1495",
      pixelId: "999888",
      capiAccessToken: "manual-tok",
    });

    expect(fetchMetaPixelCapiAccessToken).not.toHaveBeenCalled();
    expect(trackMetaPixelEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        pixelId: "999888",
        capiAccessToken: "manual-tok",
      }),
    );
  });

  it("surfaces fetch failures when no stored token exists", async () => {
    getFacebookCatalogCredential.mockResolvedValue({
      accessToken: "oauth",
      catalogId: "cat",
      businessId: "biz_1",
      pixelId: "123456",
      enabledEvents: ["Purchase"],
    });
    fetchMetaPixelCapiAccessToken.mockRejectedValue(new Error("permission denied"));

    await expect(
      testMetaServerEvents({
        shop: "demo.myshopify.com",
        testEventCode: "TEST1495",
        pixelId: "999888",
      }),
    ).rejects.toThrow(/无法为 Pixel 999888 获取 CAPI Access Token/);
  });
});

describe("formatMetaCapiTokenForLog", () => {
  const previous = process.env.META_CAPI_LOG_FULL_TOKEN;

  afterEach(() => {
    if (previous === undefined) delete process.env.META_CAPI_LOG_FULL_TOKEN;
    else process.env.META_CAPI_LOG_FULL_TOKEN = previous;
  });

  it("masks token by default", () => {
    delete process.env.META_CAPI_LOG_FULL_TOKEN;
    expect(formatMetaCapiTokenForLog("EAABBBCCCDDD")).toBe("EAA***DDD");
    expect(shouldLogFullMetaCapiToken()).toBe(false);
  });

  it("logs full token when env enabled", () => {
    process.env.META_CAPI_LOG_FULL_TOKEN = "1";
    expect(formatMetaCapiTokenForLog("EAABBBCCCDDD")).toBe("EAABBBCCCDDD");
    expect(shouldLogFullMetaCapiToken()).toBe(true);
  });
});
