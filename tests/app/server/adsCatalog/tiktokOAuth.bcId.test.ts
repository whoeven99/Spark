import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../app/server/common/outboundError.server", () => ({
  formatOutboundNetworkError: (e: unknown) =>
    e instanceof Error ? e.message : String(e),
}));

import {
  getTiktokCatalogs,
  getTiktokCatalogsForAdvertisers,
  listAccessibleBcIds,
} from "../../../../app/server/adsCatalog/tiktokOAuth.server";

const emptyMeta = { isShopifyOfficial: false as const };

describe("TikTok catalog bc_id", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("listAccessibleBcIds reads bc_id from /bc/get/", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: 0,
        data: { list: [{ bc_id: "111" }, { bc_info: { bc_id: "222" } }] },
      }),
    });

    await expect(listAccessibleBcIds({ accessToken: "tok" })).resolves.toEqual([
      "111",
      "222",
    ]);
    const calledUrl = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(calledUrl).toContain("/bc/get/");
  });

  it("getTiktokCatalogs sends bc_id query param", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: 0,
        data: { list: [{ catalog_id: "cat1", catalog_name: "Demo" }] },
      }),
    });

    const rows = await getTiktokCatalogs({
      accessToken: "tok",
      bcId: "bc-9",
      advertiserId: "adv-1",
    });
    expect(rows).toEqual([
      {
        catalogId: "cat1",
        catalogName: "Demo",
        bcId: "bc-9",
        advertiserId: "adv-1",
        catalogType: undefined,
        businessPlatform: undefined,
        channel: undefined,
        createSource: undefined,
        ...emptyMeta,
      },
    ]);
    const calledUrl = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(calledUrl).toContain("bc_id=bc-9");
    expect(calledUrl).not.toContain("advertiser_id=");
  });

  it("getTiktokCatalogsForAdvertisers aggregates catalogs across BCs", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 0, data: { list: [{ bc_id: "bc-a" }, { bc_id: "bc-b" }] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          data: { list: [{ catalog_id: "c1", catalog_name: "A" }] },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          data: { list: [{ catalog_id: "c2", catalog_name: "B" }] },
        }),
      });

    const catalogs = await getTiktokCatalogsForAdvertisers({
      accessToken: "tok",
      advertiserIds: ["adv-1", "adv-2"],
    });
    expect(catalogs).toHaveLength(2);
    expect(catalogs.map((c) => c.bcId).sort()).toEqual(["bc-a", "bc-b"]);
    expect(catalogs.every((c) => c.advertiserId === "adv-1")).toBe(true);
  });

  it("getTiktokCatalogsForAdvertisers fails when no BC is accessible", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 0, data: { list: [] } }),
    });

    await expect(
      getTiktokCatalogsForAdvertisers({
        accessToken: "tok",
        advertiserIds: ["adv-1"],
      }),
    ).rejects.toThrow(/Business Center/);
  });
});
