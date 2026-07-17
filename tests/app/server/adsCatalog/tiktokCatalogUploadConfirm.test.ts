import { describe, expect, it, vi } from "vitest";
import {
  confirmTiktokCatalogUpload,
  parseTiktokProductUploadLog,
} from "../../../../app/server/adsCatalog/clients/tiktokCatalogUploadConfirm.server";

describe("parseTiktokProductUploadLog", () => {
  it("parses success counts and error list", () => {
    const log = parseTiktokProductUploadLog({
      status: "PARTIAL_SUCCESS",
      success_count: 1,
      failed_count: 1,
      error_list: [{ sku_id: "SKU-B", error_message: "invalid image" }],
    });
    expect(log.status).toBe("partial");
    expect(log.successCount).toBe(1);
    expect(log.failedCount).toBe(1);
    expect(log.errors).toEqual([{ id: "SKU-B", reason: "invalid image" }]);
  });

  it("treats processing status as processing", () => {
    const log = parseTiktokProductUploadLog({ process_status: "PROCESSING" });
    expect(log.status).toBe("processing");
  });
});

describe("confirmTiktokCatalogUpload", () => {
  it("uses product/log terminal result instead of upload accept", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              status: "FAILED",
              success_count: 0,
              failed_count: 1,
              error_list: [{ sku_id: "SKU-1", error_message: "currency mismatch" }],
            },
          }),
          { status: 200 },
        ),
      );

    const result = await confirmTiktokCatalogUpload({
      accessToken: "tok",
      advertiserId: "adv",
      bcId: "bc",
      catalogId: "cat",
      feedLogId: "feed-1",
      expectedSkuIds: ["SKU-1"],
      deps: { fetchImpl, maxAttempts: 1, intervalMs: 0, sleep: async () => undefined },
    });

    expect(result.verifiedVia).toBe("product_log");
    expect(result.succeeded).toBe(0);
    expect(result.errors).toEqual([{ id: "SKU-1", reason: "currency mismatch" }]);
  });

  it("falls back to product/get when log stays processing", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 0, data: { status: "PROCESSING" } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            data: { list: [{ sku_id: "SKU-1" }] },
          }),
          { status: 200 },
        ),
      );

    const result = await confirmTiktokCatalogUpload({
      accessToken: "tok",
      advertiserId: "adv",
      bcId: "bc",
      catalogId: "cat",
      feedLogId: "feed-1",
      expectedSkuIds: ["SKU-1"],
      deps: { fetchImpl, maxAttempts: 1, intervalMs: 0, sleep: async () => undefined },
    });

    expect(result.verifiedVia).toBe("product_get");
    expect(result.succeeded).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it("marks unverified missing products as failed", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 0, data: { status: "PROCESSING" } }), {
          status: 200,
        }),
      )
      .mockResolvedValue(
        new Response(JSON.stringify({ code: 0, data: { list: [] } }), { status: 200 }),
      );

    const result = await confirmTiktokCatalogUpload({
      accessToken: "tok",
      advertiserId: "adv",
      bcId: "bc",
      catalogId: "cat",
      feedLogId: "feed-9",
      expectedSkuIds: ["SKU-1"],
      deps: { fetchImpl, maxAttempts: 1, intervalMs: 0, sleep: async () => undefined },
    });

    expect(result.succeeded).toBe(0);
    expect(result.errors[0]?.reason).toContain("feed_log=feed-9");
  });
});
