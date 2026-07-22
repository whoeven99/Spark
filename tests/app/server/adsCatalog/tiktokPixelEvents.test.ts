import { afterEach, describe, expect, it, vi } from "vitest";

import {
  listTiktokPixels,
  trackTiktokPixelEvent,
} from "../../../../app/server/adsCatalog/clients/tiktokCatalogClient.server";
import {
  normalizeTiktokEnabledEvents,
  TIKTOK_PIXEL_DEFAULT_EVENTS,
  buildTiktokEventsManagerUrl,
  buildTiktokEventsManagerTestUrl,
  buildTiktokPixelThemeEditorUrl,
  buildShopOnlineStoreUrl,
  TIKTOK_PIXEL_APP_EMBED_HANDLE,
} from "../../../../app/lib/tiktokPixelEvents";

describe("tiktokPixelEvents helpers", () => {
  it("normalizes enabled events and falls back to defaults", () => {
    expect(normalizeTiktokEnabledEvents(undefined)).toEqual([...TIKTOK_PIXEL_DEFAULT_EVENTS]);
    expect(normalizeTiktokEnabledEvents(["ViewContent", "bogus", "ViewContent", "Lead"])).toEqual([
      "ViewContent",
      "Lead",
    ]);
  });

  it("builds Events Manager deep link", () => {
    expect(buildTiktokEventsManagerUrl("PX1")).toContain("/pixel/detail/PX1");
    expect(buildTiktokEventsManagerUrl()).toContain("events_manager");
    expect(buildTiktokEventsManagerTestUrl("PX1")).toContain("tab=test");
  });

  it("builds theme editor App embed deep link", () => {
    const url = buildTiktokPixelThemeEditorUrl({
      shopDomain: "ciwishop.myshopify.com",
      apiKey: "940b967eda872dd81f9ffc283e29a013",
    });
    expect(url).toBe(
      `https://admin.shopify.com/store/ciwishop/themes/current/editor?context=apps&activateAppId=940b967eda872dd81f9ffc283e29a013/${TIKTOK_PIXEL_APP_EMBED_HANDLE}`,
    );
    expect(
      buildTiktokPixelThemeEditorUrl({ shopDomain: "ciwishop", apiKey: "abc" }),
    ).toContain("/store/ciwishop/themes/current/editor");
    expect(buildTiktokPixelThemeEditorUrl({ shopDomain: "x", apiKey: "" })).toBeNull();
  });

  it("builds online store URL", () => {
    expect(buildShopOnlineStoreUrl("ciwishop.myshopify.com")).toBe(
      "https://ciwishop.myshopify.com/",
    );
    expect(buildShopOnlineStoreUrl("ciwishop")).toBe("https://ciwishop.myshopify.com/");
    expect(buildShopOnlineStoreUrl("")).toBeNull();
    expect(buildShopOnlineStoreUrl("ciwishop", { testEventCode: "TEST54000" })).toBe(
      "https://ciwishop.myshopify.com/?spark_tt_test_code=TEST54000",
    );
    expect(buildShopOnlineStoreUrl("ciwishop", { testEventCode: "" })).toBe(
      "https://ciwishop.myshopify.com/?spark_tt_test_code=",
    );
  });
});

describe("listTiktokPixels / trackTiktokPixelEvent", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses pixel/list response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          code: 0,
          data: {
            pixels: [
              { pixel_code: "AAA", pixel_name: "One" },
              { pixel_code: "AAA", pixel_name: "Dup" },
              { pixel_code: "BBB", pixel_name: "Two" },
            ],
          },
        }),
    }) as unknown as typeof fetch;

    const pixels = await listTiktokPixels({
      accessToken: "tok",
      advertiserId: "adv-1",
    });
    expect(pixels).toEqual([
      { pixelCode: "AAA", pixelName: "One", pixelId: undefined },
      { pixelCode: "BBB", pixelName: "Two", pixelId: undefined },
    ]);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
    ];
    expect(url).toContain("page_size=20");
  });

  it("clamps pixel/list page_size to 20", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ code: 0, data: { pixels: [] } }),
    }) as unknown as typeof fetch;

    await listTiktokPixels({
      accessToken: "tok",
      advertiserId: "adv-1",
      pageSize: 50,
    });
    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
    ];
    expect(url).toContain("page_size=20");
  });

  it("tracks pixel event with Events API token header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ code: 0 }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await trackTiktokPixelEvent({
      eventsApiAccessToken: "events-tok",
      pixelCode: "PX1",
      event: "CompletePayment",
      eventId: "1001",
      properties: { value: 12, currency: "USD" },
      testEventCode: "TEST12345",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/pixel/track/");
    expect((init.headers as Record<string, string>)["Access-Token"]).toBe("events-tok");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.pixel_code).toBe("PX1");
    expect(body.event).toBe("CompletePayment");
    expect(body.event_id).toBe("1001");
    expect(body.test_event_code).toBe("TEST12345");
  });
});
