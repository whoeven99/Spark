import { beforeEach, describe, expect, it, vi } from "vitest";

const getTiktokCatalogCredential = vi.hoisted(() => vi.fn());
const trackTiktokPixelEvent = vi.hoisted(() => vi.fn());

vi.mock("../../../../app/server/adsCatalog/credentialStore.server", () => ({
  getTiktokCatalogCredential: (...args: unknown[]) => getTiktokCatalogCredential(...args),
  setTiktokCatalogCredential: vi.fn(),
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

import { maybeTrackTiktokCompletePayment } from "../../../../app/server/adsCatalog/tiktokPixelConfig.server";

describe("maybeTrackTiktokCompletePayment", () => {
  beforeEach(() => {
    getTiktokCatalogCredential.mockReset();
    trackTiktokPixelEvent.mockReset();
    trackTiktokPixelEvent.mockResolvedValue(undefined);
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
      }),
    );
  });
});
