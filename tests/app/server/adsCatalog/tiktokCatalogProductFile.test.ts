import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadTiktokCatalogProductFile } from "../../../../app/server/adsCatalog/clients/tiktokCatalogClient.server";

describe("uploadTiktokCatalogProductFile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("submits file_url and returns feed_log_id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          code: 0,
          message: "OK",
          request_id: "req-1",
          data: { feed_log_id: "feed-99" },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadTiktokCatalogProductFile({
      accessToken: "tok",
      bcId: "bc-1",
      catalogId: "cat-1",
      fileUrl: "https://example.blob.core.windows.net/adscatalog/feed.csv?sas=1",
    });

    expect(result).toEqual({ feedLogId: "feed-99", requestId: "req-1" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/catalog/product/file/");
    const body = JSON.parse(String(init.body)) as Record<string, string>;
    expect(body).toMatchObject({
      bc_id: "bc-1",
      catalog_id: "cat-1",
      update_mode: "INCREMENTAL",
    });
    expect(body.file_url).toContain("feed.csv");
  });

  it("throws when TikTok returns non-zero code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            code: 40002,
            message: "Your catalog is synced from Shopify and cannot be modified via API.",
          }),
      }),
    );

    await expect(
      uploadTiktokCatalogProductFile({
        accessToken: "tok",
        bcId: "bc-1",
        catalogId: "cat-1",
        fileUrl: "https://example.com/feed.csv",
      }),
    ).rejects.toThrow(/code=40002/);
  });
});
