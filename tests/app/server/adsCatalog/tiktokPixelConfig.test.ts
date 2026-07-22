import { beforeEach, describe, expect, it, vi } from "vitest";

const getTiktokCatalogCredential = vi.hoisted(() => vi.fn());
const setTiktokCatalogCredential = vi.hoisted(() => vi.fn());
const trackTiktokPixelEvent = vi.hoisted(() => vi.fn());

vi.mock("../../../../app/server/adsCatalog/credentialStore.server", () => ({
  getTiktokCatalogCredential: (...args: unknown[]) => getTiktokCatalogCredential(...args),
  setTiktokCatalogCredential: (...args: unknown[]) => setTiktokCatalogCredential(...args),
}));

vi.mock("../../../../app/server/adsCatalog/clients/tiktokCatalogClient.server", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../../app/server/adsCatalog/clients/tiktokCatalogClient.server")
    >();
  return {
    ...actual,
    trackTiktokPixelEvent: (...args: unknown[]) => trackTiktokPixelEvent(...args),
  };
});

import {
  clearTiktokPixelTestEventMode,
  maybeTrackTiktokCompletePayment,
  startTiktokPixelTestEventMode,
  trackTiktokStorefrontTestEvent,
} from "../../../../app/server/adsCatalog/tiktokPixelConfig.server";

describe("maybeTrackTiktokCompletePayment", () => {
  beforeEach(() => {
    getTiktokCatalogCredential.mockReset();
    setTiktokCatalogCredential.mockReset();
    trackTiktokPixelEvent.mockReset();
    trackTiktokPixelEvent.mockResolvedValue(undefined);
    setTiktokCatalogCredential.mockResolvedValue(undefined);
  });

  it("skips when Events API disabled or token missing", async () => {
    getTiktokCatalogCredential.mockResolvedValue({
      accessToken: "oauth",
      advertiserId: "adv",
      catalogId: "cat",
      bindingMode: "api_managed",
      pixelCode: "PX",
      eventsApiEnabled: false,
      eventsApiAccessToken: "tok",
      enabledEvents: ["CompletePayment"],
    });
    expect(await maybeTrackTiktokCompletePayment({ shop: "s.myshopify.com", orderId: "1" })).toEqual(
      { sent: false, reason: "events_api_disabled" },
    );

    getTiktokCatalogCredential.mockResolvedValue({
      accessToken: "oauth",
      advertiserId: "adv",
      catalogId: "cat",
      bindingMode: "api_managed",
      pixelCode: "PX",
      eventsApiEnabled: true,
      enabledEvents: ["CompletePayment"],
    });
    expect(await maybeTrackTiktokCompletePayment({ shop: "s.myshopify.com", orderId: "1" })).toEqual(
      { sent: false, reason: "no_events_api_token" },
    );
  });

  it("sends CompletePayment when enabled", async () => {
    getTiktokCatalogCredential.mockResolvedValue({
      accessToken: "oauth",
      advertiserId: "adv",
      catalogId: "cat",
      bindingMode: "api_managed",
      pixelCode: "PX",
      eventsApiEnabled: true,
      eventsApiAccessToken: "events-tok",
      enabledEvents: ["CompletePayment", "ViewContent"],
    });

    const result = await maybeTrackTiktokCompletePayment({
      shop: "s.myshopify.com",
      orderId: "99",
      orderName: "#1001",
      value: 42,
      currency: "EUR",
    });

    expect(result).toEqual({ sent: true });
    expect(trackTiktokPixelEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventsApiAccessToken: "events-tok",
        pixelCode: "PX",
        event: "CompletePayment",
        eventId: "#1001",
        properties: { value: 42, currency: "EUR" },
        testEventCode: undefined,
      }),
    );
  });

  it("includes test_event_code when test mode is active", async () => {
    getTiktokCatalogCredential.mockResolvedValue({
      accessToken: "oauth",
      advertiserId: "adv",
      catalogId: "cat",
      bindingMode: "api_managed",
      pixelCode: "PX",
      eventsApiEnabled: true,
      eventsApiAccessToken: "events-tok",
      enabledEvents: ["CompletePayment"],
      testEventCode: "TEST54000",
    });

    await maybeTrackTiktokCompletePayment({
      shop: "s.myshopify.com",
      orderId: "99",
      orderName: "#1001",
    });

    expect(trackTiktokPixelEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "CompletePayment",
        testEventCode: "TEST54000",
      }),
    );
  });
});

describe("trackTiktokStorefrontTestEvent", () => {
  beforeEach(() => {
    getTiktokCatalogCredential.mockReset();
    trackTiktokPixelEvent.mockReset();
    trackTiktokPixelEvent.mockResolvedValue(undefined);
  });

  it("skips when test mode is off", async () => {
    getTiktokCatalogCredential.mockResolvedValue({
      accessToken: "oauth",
      advertiserId: "adv",
      catalogId: "cat",
      bindingMode: "api_managed",
      pixelCode: "PX",
      eventsApiEnabled: true,
      eventsApiAccessToken: "events-tok",
      enabledEvents: ["ViewContent"],
    });
    expect(
      await trackTiktokStorefrontTestEvent({
        shop: "s.myshopify.com",
        event: "ViewContent",
      }),
    ).toEqual({ sent: false, reason: "test_mode_off" });
  });

  it("sends ViewContent with test_event_code in test mode", async () => {
    getTiktokCatalogCredential.mockResolvedValue({
      accessToken: "oauth",
      advertiserId: "adv",
      catalogId: "cat",
      bindingMode: "api_managed",
      pixelCode: "PX",
      eventsApiEnabled: true,
      eventsApiAccessToken: "events-tok",
      enabledEvents: ["ViewContent", "AddToCart"],
      testEventCode: "TEST54000",
    });

    const result = await trackTiktokStorefrontTestEvent({
      shop: "ciwishop.myshopify.com",
      event: "ViewContent",
      eventId: "e1",
      properties: { value: 12, currency: "USD" },
      pageUrl: "https://ciwishop.myshopify.com/products/x",
    });

    expect(result).toEqual({ sent: true });
    expect(trackTiktokPixelEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "ViewContent",
        eventId: "e1",
        testEventCode: "TEST54000",
        properties: { value: 12, currency: "USD" },
        context: { page: { url: "https://ciwishop.myshopify.com/products/x" } },
      }),
    );
  });
});

describe("TikTok pixel test event mode", () => {
  const admin = { graphql: vi.fn() } as never;

  beforeEach(() => {
    getTiktokCatalogCredential.mockReset();
    setTiktokCatalogCredential.mockReset();
    setTiktokCatalogCredential.mockResolvedValue(undefined);
    (admin as { graphql: ReturnType<typeof vi.fn> }).graphql = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          shop: { id: "gid://shopify/Shop/1" },
          metafieldsSet: { userErrors: [] },
        },
      }),
    });
  });

  it("startTiktokPixelTestEventMode writes testEventCode and syncs metafield", async () => {
    getTiktokCatalogCredential.mockResolvedValue({
      accessToken: "oauth",
      advertiserId: "adv",
      catalogId: "cat",
      catalogName: "Cat",
      bindingMode: "api_managed",
      pixelCode: "PX",
      bcId: "bc1",
      refreshToken: "rt",
      eventsApiEnabled: true,
      enabledEvents: ["CompletePayment"],
    });

    await startTiktokPixelTestEventMode({
      shop: "s.myshopify.com",
      admin,
      testEventCode: " TEST54000 ",
    });

    expect(setTiktokCatalogCredential).toHaveBeenCalledWith(
      "s.myshopify.com",
      expect.objectContaining({
        accessToken: "oauth",
        advertiserId: "adv",
        catalogId: "cat",
        testEventCode: "TEST54000",
      }),
    );
    expect((admin as { graphql: ReturnType<typeof vi.fn> }).graphql).toHaveBeenCalled();
  });

  it("clearTiktokPixelTestEventMode clears testEventCode", async () => {
    getTiktokCatalogCredential.mockResolvedValue({
      accessToken: "oauth",
      advertiserId: "adv",
      catalogId: "cat",
      bindingMode: "api_managed",
      pixelCode: "PX",
      testEventCode: "TEST54000",
      eventsApiEnabled: true,
      enabledEvents: ["CompletePayment"],
    });

    await clearTiktokPixelTestEventMode({ shop: "s.myshopify.com", admin });

    expect(setTiktokCatalogCredential).toHaveBeenCalledWith(
      "s.myshopify.com",
      expect.objectContaining({
        testEventCode: "",
      }),
    );
    expect((admin as { graphql: ReturnType<typeof vi.fn> }).graphql).toHaveBeenCalled();
  });
});
