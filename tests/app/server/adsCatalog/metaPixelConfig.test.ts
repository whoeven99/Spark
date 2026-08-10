import { beforeEach, describe, expect, it, vi } from "vitest";

const getFacebookCatalogCredential = vi.hoisted(() => vi.fn());
const setFacebookCatalogCredential = vi.hoisted(() => vi.fn());
const trackMetaPixelEvent = vi.hoisted(() => vi.fn());

vi.mock("../../../../app/server/adsCatalog/credentialStore.server", () => ({
  getFacebookCatalogCredential: (...args: unknown[]) => getFacebookCatalogCredential(...args),
  setFacebookCatalogCredential: (...args: unknown[]) => setFacebookCatalogCredential(...args),
}));

vi.mock("../../../../app/server/adsCatalog/clients/metaConversionsApiClient.server", () => ({
  trackMetaPixelEvent: (...args: unknown[]) => trackMetaPixelEvent(...args),
}));

import {
  maybeTrackMetaPurchase,
  testMetaServerEvents,
  trackMetaStorefrontTestEvent,
} from "../../../../app/server/adsCatalog/metaPixelConfig.server";

describe("maybeTrackMetaPurchase", () => {
  beforeEach(() => {
    getFacebookCatalogCredential.mockReset();
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
      accessToken: "oauth",
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
});

describe("trackMetaStorefrontTestEvent", () => {
  beforeEach(() => {
    getFacebookCatalogCredential.mockReset();
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
    trackMetaPixelEvent.mockReset();
    trackMetaPixelEvent.mockResolvedValue(undefined);
  });

  it("sends Purchase test event with customer matching fields", async () => {
    getFacebookCatalogCredential.mockResolvedValue({
      accessToken: "oauth",
      catalogId: "cat",
      pixelId: "123456",
      capiAccessToken: "capi-tok",
      enabledEvents: ["Purchase"],
    });

    await testMetaServerEvents({
      shop: "demo.myshopify.com",
      testEventCode: "TEST1495",
      clientIpAddress: "203.0.113.10",
      clientUserAgent: "Mozilla/5.0",
    });

    expect(trackMetaPixelEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        pixelId: "123456",
        capiAccessToken: "capi-tok",
        eventName: "Purchase",
        testEventCode: "TEST1495",
        email: "spark-capi-test@demo.myshopify.com",
        clientIpAddress: "203.0.113.10",
        clientUserAgent: "Mozilla/5.0",
        eventSourceUrl: "https://demo.myshopify.com",
      }),
    );
  });
});
