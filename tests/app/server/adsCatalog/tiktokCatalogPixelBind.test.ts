import { afterEach, describe, expect, it, vi } from "vitest";

const listAuthorizedAdvertiserIds = vi.hoisted(() => vi.fn());

vi.mock("../../../../app/server/adsCatalog/tiktokOAuth.server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../app/server/adsCatalog/tiktokOAuth.server")>();
  return {
    ...actual,
    listAuthorizedAdvertiserIds: (...args: unknown[]) => listAuthorizedAdvertiserIds(...args),
  };
});

import {
  getTiktokEventSourceBindErrorCode,
  linkTiktokBcPixelToAdvertiser,
  prepareTiktokPixelForCatalogBind,
  resolveTiktokPixelBindAdvertiserId,
  uniqueAdvertiserIds,
} from "../../../../app/server/adsCatalog/clients/tiktokCatalogClient.server";

describe("getTiktokEventSourceBindErrorCode", () => {
  it("maps TikTok 1000018 to stable error code", () => {
    expect(
      getTiktokEventSourceBindErrorCode(
        "TikTok Catalog event source bind failed: HTTP 200 ERRCODE_EVENT_SOURCE_NOT_AVAILABLE_FOR_ADV.",
      ),
    ).toBe("EVENT_SOURCE_NOT_AVAILABLE_FOR_ADV");
  });

  it("maps Pixel asset permission failures", () => {
    expect(
      getTiktokEventSourceBindErrorCode(
        "TikTok Pixel link/get failed after link: You don't have permission to the asset(123) [PIXEL_ASSET_PERMISSION_DENIED]",
      ),
    ).toBe("PIXEL_ASSET_PERMISSION_DENIED");
    expect(
      getTiktokEventSourceBindErrorCode("HTTP 200 code=40002 permission denied"),
    ).toBe("PIXEL_ASSET_PERMISSION_DENIED");
  });

  it("returns undefined for unrelated errors", () => {
    expect(getTiktokEventSourceBindErrorCode("network timeout")).toBeUndefined();
  });
});

describe("uniqueAdvertiserIds / resolveTiktokPixelBindAdvertiserId", () => {
  it("dedupes advertiser ids", () => {
    expect(uniqueAdvertiserIds("a", ["b", "a"], ["", "c"], null)).toEqual(["a", "b", "c"]);
  });

  it("prefers catalog-linked advertiser that is authorized", () => {
    expect(
      resolveTiktokPixelBindAdvertiserId({
        credentialAdvertiserId: "adv-cred",
        authorizedAdvertiserIds: ["adv-ocu", "adv-adv"],
        catalogLinkedAdvertiserIds: ["adv-adv"],
      }),
    ).toBe("adv-adv");
  });

  it("falls back to credential when catalog link is outside authorized set", () => {
    expect(
      resolveTiktokPixelBindAdvertiserId({
        credentialAdvertiserId: "adv-cred",
        authorizedAdvertiserIds: ["adv-cred", "adv-other"],
        catalogLinkedAdvertiserIds: ["adv-outside"],
      }),
    ).toBe("adv-cred");
  });
});

describe("linkTiktokBcPixelToAdvertiser / prepareTiktokPixelForCatalogBind", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    listAuthorizedAdvertiserIds.mockReset();
  });

  it("sends all advertiser_ids in link body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ code: 0, message: "OK", data: {} }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await linkTiktokBcPixelToAdvertiser({
      accessToken: "tok",
      bcId: "bc-1",
      pixelCode: "PX1",
      advertiserIds: ["adv-1", "adv-2", "adv-1"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as {
      advertiser_ids: string[];
      relation_status: string;
    };
    expect(body.advertiser_ids).toEqual(["adv-1", "adv-2"]);
    expect(body.relation_status).toBe("LINK");
  });

  it("hard-fails when link fails and does not swallow the error", async () => {
    listAuthorizedAdvertiserIds.mockResolvedValue(["adv-1", "adv-2"]);
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/bc/pixel/transfer/")) {
        return {
          status: 200,
          ok: true,
          text: async () => JSON.stringify({ code: 0, data: {} }),
        };
      }
      if (url.includes("/bc/pixel/link/update/")) {
        return {
          status: 200,
          ok: true,
          text: async () =>
            JSON.stringify({ code: 40001, message: "link denied", data: {} }),
        };
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    await expect(
      prepareTiktokPixelForCatalogBind({
        accessToken: "tok",
        bcId: "bc-1",
        pixelCode: "PX1",
        advertiserId: "adv-1",
      }),
    ).rejects.toThrow(/Pixel link to advertiser failed/);
  });

  it("throws PIXEL_ASSET_PERMISSION_DENIED when link/get returns 40002", async () => {
    listAuthorizedAdvertiserIds.mockResolvedValue(["adv-1"]);
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/bc/pixel/transfer/") || url.includes("/bc/pixel/link/update/")) {
        return {
          status: 200,
          ok: true,
          text: async () => JSON.stringify({ code: 0, data: {} }),
        };
      }
      if (url.includes("/bc/pixel/link/get/")) {
        return {
          status: 200,
          ok: true,
          text: async () =>
            JSON.stringify({
              code: 40002,
              message: "You don't have permission to the asset(999)",
              data: {},
            }),
        };
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    await expect(
      prepareTiktokPixelForCatalogBind({
        accessToken: "tok",
        bcId: "bc-1",
        pixelCode: "PX1",
        advertiserId: "adv-1",
        extraAdvertiserIds: ["adv-2"],
      }),
    ).rejects.toThrow(/PIXEL_ASSET_PERMISSION_DENIED/);
  });
});
