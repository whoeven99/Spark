import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listMetaAdAccountPixels,
  listMetaBusinessPixels,
} from "../../../../app/server/adsCatalog/clients/facebookGraphClient.server";

describe("listMetaAdAccountPixels / listMetaBusinessPixels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists and dedupes ad account pixels", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: "123", name: "Pixel A" },
            { id: "123", name: "Dup" },
            { id: "456", name: "Pixel B" },
          ],
        }),
      }),
    );

    const pixels = await listMetaAdAccountPixels({
      accessToken: "token",
      adAccountId: "act_1",
    });

    expect(pixels).toEqual([
      { pixelId: "123", pixelName: "Pixel A" },
      { pixelId: "456", pixelName: "Pixel B" },
    ]);
  });

  it("lists business owned pixels", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: "789", name: "Owned" }],
        }),
      }),
    );

    const pixels = await listMetaBusinessPixels({
      accessToken: "token",
      businessId: "biz_1",
    });

    expect(pixels).toEqual([{ pixelId: "789", pixelName: "Owned" }]);
  });
});
