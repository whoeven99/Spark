import { describe, expect, it, vi } from "vitest";
import {
  confirmTiktokCatalogUpload,
  extractFeedLogDataUrl,
  parseTiktokFeedLogCsv,
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

  it("parses product_feed_log add_count/error_count/end_time shape", () => {
    const log = parseTiktokProductUploadLog({
      product_feed_log: {
        add_count: 0,
        delete_count: 0,
        error_count: 0,
        end_time: "2026-07-17 06:58:27",
        feed_id: "30090912",
        feed_log_data: {
          en: "https://sf16-muse-va.tiktokcdn.com/obj/example/en.csv",
          ja: "https://sf16-muse-va.tiktokcdn.com/obj/example/ja.csv",
        },
      },
    });
    expect(log.status).toBe("failed");
    expect(log.successCount).toBe(0);
    expect(log.failedCount).toBe(0);
    expect(log.endTime).toBe("2026-07-17 06:58:27");
    expect(log.feedLogDataUrl).toBe("https://sf16-muse-va.tiktokcdn.com/obj/example/en.csv");
  });

  it("treats add_count>0 with end_time as success", () => {
    const log = parseTiktokProductUploadLog({
      product_feed_log: {
        add_count: 2,
        error_count: 0,
        end_time: "2026-07-17 06:58:27",
      },
    });
    expect(log.status).toBe("success");
    expect(log.successCount).toBe(2);
    expect(log.failedCount).toBe(0);
  });
});

describe("extractFeedLogDataUrl", () => {
  it("prefers en URL from feed_log_data", () => {
    expect(
      extractFeedLogDataUrl({
        product_feed_log: {
          feed_log_data: {
            ja: "https://cdn.example/ja.csv",
            en: "https://cdn.example/en.csv",
          },
        },
      }),
    ).toBe("https://cdn.example/en.csv");
  });
});

describe("parseTiktokFeedLogCsv", () => {
  it("parses sku and error columns", () => {
    const csv = [
      "sku_id,error_message,status",
      "SKU-1,currency mismatch,ERROR",
      "SKU-2,ok,SUCCESS",
      '"SKU-3","invalid ""image""",FAIL',
    ].join("\n");
    expect(parseTiktokFeedLogCsv(csv)).toEqual([
      { id: "SKU-1", reason: "currency mismatch" },
      { id: "SKU-3", reason: 'invalid "image"' },
    ]);
  });

  it("parses Chinese headers and tab delimiter", () => {
    const csv = ["商品ID\t错误信息\t状态", "A2504\t图片尺寸过小\t错误"].join("\n");
    expect(parseTiktokFeedLogCsv(csv)).toEqual([
      { id: "A2504", reason: "图片尺寸过小" },
    ]);
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

  it("settles product_feed_log add_count=0 via product_log and downloads CSV reasons", async () => {
    const csvUrl = "https://cdn.example.com/feed-en.csv";
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/catalog/product/log/")) {
        return new Response(
          JSON.stringify({
            code: 0,
            message: "OK",
            data: {
              product_feed_log: {
                add_count: 0,
                delete_count: 0,
                error_count: 0,
                end_time: "2026-07-17 06:58:27",
                feed_log_data: { en: csvUrl },
              },
            },
          }),
          { status: 200 },
        );
      }
      if (url === csvUrl) {
        return new Response("sku_id,error_message,status\nSKU-1,image too small,ERROR\n", {
          status: 200,
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await confirmTiktokCatalogUpload({
      accessToken: "tok",
      advertiserId: "adv",
      bcId: "bc",
      catalogId: "cat",
      feedLogId: "1367186020",
      expectedSkuIds: ["SKU-1"],
      deps: { fetchImpl, maxAttempts: 1, intervalMs: 0, sleep: async () => undefined },
    });

    expect(result.verifiedVia).toBe("product_log");
    expect(result.succeeded).toBe(0);
    expect(result.errors).toEqual([{ id: "SKU-1", reason: "image too small" }]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("surfaces CSV summary and details URL when rows cannot be SKU-aligned", async () => {
    const csvUrl = "https://cdn.example.com/feed-diag.csv";
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/catalog/product/log/")) {
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              product_feed_log: {
                add_count: 0,
                error_count: 10,
                end_time: "2026-07-17 07:18:32",
                feed_log_data: { en: csvUrl },
              },
            },
          }),
          { status: 200 },
        );
      }
      if (url === csvUrl) {
        return new Response("note\nImage must be at least 500x500 pixels\n", { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await confirmTiktokCatalogUpload({
      accessToken: "tok",
      advertiserId: "adv",
      bcId: "bc",
      catalogId: "cat",
      feedLogId: "1367197677",
      expectedSkuIds: ["A2504"],
      deps: { fetchImpl, maxAttempts: 1, intervalMs: 0, sleep: async () => undefined },
    });

    expect(result.succeeded).toBe(0);
    expect(result.errors[0]?.reason).toContain("Image must be at least 500x500 pixels");
    expect(result.errors[0]?.reason).toContain(`details=${csvUrl}`);
    expect(result.errors[0]?.reason).toContain("error_count=10");
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
