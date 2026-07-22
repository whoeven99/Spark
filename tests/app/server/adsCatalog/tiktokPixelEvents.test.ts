import { afterEach, describe, expect, it, vi } from "vitest";

import {
  listTiktokPixels,
  trackTiktokPixelEvent,
} from "../../../../app/server/adsCatalog/clients/tiktokCatalogClient.server";
import {
  normalizeTiktokEnabledEvents,
  TIKTOK_PIXEL_DEFAULT_EVENTS,
  buildTiktokEventsManagerUrl,
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
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/pixel/track/");
    expect((init.headers as Record<string, string>)["Access-Token"]).toBe("events-tok");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.pixel_code).toBe("PX1");
    expect(body.event).toBe("CompletePayment");
    expect(body.event_id).toBe("1001");
  });
});
