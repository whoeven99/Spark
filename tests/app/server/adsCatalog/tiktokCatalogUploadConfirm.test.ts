import { describe, expect, it, vi } from "vitest";
import {
  confirmTiktokCatalogUpload,
  collectFeedLogDataUrls,
  extractFeedLogDataUrl,
  isProductLogResolvable,
  parseTiktokFeedLogCsv,
  parseTiktokProductUploadLog,
  analyzeTiktokFeedLogCsv,
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

  it("treats process_status SUCCESS with add_count=0 as failed (job done, no ingest)", () => {
    const log = parseTiktokProductUploadLog({
      process_status: "SUCCESS",
      add_count: 0,
      error_count: 0,
      end_time: "2026-07-17 08:02:01",
    });
    expect(log.status).toBe("failed");
    expect(log.successCount).toBe(0);
    expect(isProductLogResolvable(log)).toBe(false);
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
  it("prefers en URL from feed_log_data (flat shape)", () => {
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

  it("extracts en URL from feed_log_data.download_path (real API shape)", () => {
    expect(
      extractFeedLogDataUrl({
        product_feed_log: {
          error_count: 10,
          end_time: "2026-07-17 07:25:50",
          feed_log_data: {
            download_path: {
              ar: "https://cdn.tiktok/ar.csv",
              en: "https://cdn.tiktok/en.csv",
              fr: "https://cdn.tiktok/fr.csv",
            },
          },
        },
        feed_log_id: "1367200856",
      }),
    ).toBe("https://cdn.tiktok/en.csv");
  });

  it("falls back to any URL when no preferred language found in download_path", () => {
    const result = extractFeedLogDataUrl({
      product_feed_log: {
        feed_log_data: {
          download_path: {
            ar: "https://cdn.tiktok/ar.csv",
            fr: "https://cdn.tiktok/fr.csv",
          },
        },
      },
    });
    expect(result).toMatch(/^https:\/\/cdn\.tiktok\//);
  });

  it("collects URLs from feed_log_data array shape", () => {
    expect(
      collectFeedLogDataUrls({
        product_feed_log: {
          feed_log_data: [
            { language: "fr", download_url: "https://cdn.tiktok/fr.csv" },
            { language: "en", download_url: "https://cdn.tiktok/en.csv" },
          ],
        },
      }),
    ).toEqual(["https://cdn.tiktok/en.csv", "https://cdn.tiktok/fr.csv"]);
  });
});

describe("parseTiktokFeedLogCsv", () => {
  it("treats Warning severity rows as non-failures (not included in errors)", () => {
    const csv = [
      "SKU ID,Line,Severity,Issue,How to fix,Property name,Value in feed,Sample value,Feed ID,Feed Name,Feed Upload Time",
      '"A2504","2","Warning","An optional but recommended field is missing: google_product_category/product_type","We recommend you include either ""google_product_category"" or ""product_type"" for ad optimization. Example: Apparel & Accessories > Clothing > Shirts","google_product_category","","Apparel & Accessories > Clothing > Shirts","30898912","default","2026-07-17 06:56:30"',
    ].join("\n");
    expect(parseTiktokFeedLogCsv(csv)).toEqual([]);

    const analysis = analyzeTiktokFeedLogCsv(csv);
    expect(analysis.warnings).toEqual([
      {
        id: "A2504",
        reason:
          '[warning] An optional but recommended field is missing: google_product_category/product_type. We recommend you include either "google_product_category" or "product_type" for ad optimization. Example: Apparel & Accessories > Clothing > Shirts',
      },
    ]);
  });

  it("still treats Error severity rows as failures and appends How to fix", () => {
    const csv = [
      "SKU ID,Line,Severity,Issue,How to fix,Property name,Value in feed,Sample value,Feed ID,Feed Name,Feed Upload Time",
      '"A2504","2","Error","The number of api submit exceeds the limit (once a minute)","You should wait a minute","","","","30898912","default","2026-07-17 06:56:30"',
    ].join("\n");
    const result = parseTiktokFeedLogCsv(csv);
    expect(result).toEqual([
      {
        id: "A2504",
        reason:
          "The number of api submit exceeds the limit (once a minute). You should wait a minute",
      },
    ]);
  });

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

  it("surfaces parsed CSV reason without HTTPS details URL when rows cannot be SKU-aligned", async () => {
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
    expect(result.errors[0]?.reason).toBe("Image must be at least 500x500 pixels");
    expect(result.errors[0]?.reason).not.toMatch(/https?:\/\//i);
    expect(result.errors[0]?.reason).not.toContain("details=");
  });

  it("keeps diagnostic details URL when product log has no parseable CSV reason", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/catalog/product/log/")) {
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              product_feed_log: {
                add_count: 0,
                error_count: 0,
                end_time: "2026-07-17 08:00:00",
              },
            },
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await confirmTiktokCatalogUpload({
      accessToken: "tok",
      advertiserId: "adv",
      bcId: "bc",
      catalogId: "cat",
      feedLogId: "1367999999",
      expectedSkuIds: ["A2504"],
      deps: { fetchImpl, maxAttempts: 1, intervalMs: 0, sleep: async () => undefined },
    });

    expect(result.succeeded).toBe(0);
    expect(result.errors[0]?.reason).toContain("rejected by TikTok Catalog product log");
    expect(result.errors[0]?.reason).toContain("add_count=0");
    expect(result.errors[0]?.reason).toContain("feed_log=1367999999");
  });

  it("surfaces Warning CSV Issue+How to fix as failure reason when add_count=0", async () => {
    const csvUrl = "https://cdn.example.com/feed-warning.csv";
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/catalog/product/log/")) {
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              product_feed_log: {
                add_count: 0,
                error_count: 0,
                end_time: "2026-07-17 07:45:14",
                feed_log_data: { en: csvUrl },
              },
            },
          }),
          { status: 200 },
        );
      }
      if (url === csvUrl) {
        return new Response(
          [
            "SKU ID,Line,Severity,Issue,How to fix,Property name,Value in feed,Sample value,Feed ID,Feed Name,Feed Upload Time",
            '"A2504","2","Warning","An optional but recommended field is missing: google_product_category/product_type","We recommend you include either ""google_product_category"" or ""product_type"" for ad optimization. Example: Apparel & Accessories > Clothing > Shirts","google_product_category","","Apparel & Accessories > Clothing > Shirts","30898912","default","2026-07-17 06:56:30"',
          ].join("\n"),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await confirmTiktokCatalogUpload({
      accessToken: "tok",
      advertiserId: "adv",
      bcId: "bc",
      catalogId: "cat",
      feedLogId: "1367210718",
      expectedSkuIds: ["A2504"],
      deps: { fetchImpl, maxAttempts: 1, intervalMs: 0, sleep: async () => undefined },
    });

    expect(result.succeeded).toBe(0);
    expect(result.errors[0]?.id).toBe("A2504");
    expect(result.errors[0]?.reason).toContain(
      "An optional but recommended field is missing: google_product_category/product_type",
    );
    expect(result.errors[0]?.reason).toContain(
      'We recommend you include either "google_product_category" or "product_type"',
    );
    expect(result.errors[0]?.reason).not.toMatch(/https?:\/\//i);
  });

  it("downloads CSV and surfaces per-SKU reason when API uses download_path nesting", async () => {
    const csvUrl = "https://cdn.tiktok.com/feed-en.csv";
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/catalog/product/log/")) {
        return new Response(
          JSON.stringify({
            code: 0,
            message: "OK",
            data: {
              product_feed_log: {
                error_count: 10,
                end_time: "2026-07-17 07:25:50",
                feed_log_data: {
                  download_path: {
                    ar: "https://cdn.tiktok.com/feed-ar.csv",
                    en: csvUrl,
                    fr: "https://cdn.tiktok.com/feed-fr.csv",
                  },
                },
              },
              feed_log_id: "1367200856",
            },
          }),
          { status: 200 },
        );
      }
      if (url === csvUrl) {
        return new Response(
          [
            "SKU ID,Line,Severity,Issue,How to fix,Property name,Value in feed,Sample value,Feed ID,Feed Name,Feed Upload Time",
            '"A2504","2","Error","The number of api submit exceeds the limit (once a minute)","You should wait a minute before submitting the data","","","","30898912","default","2026-07-17 06:56:30"',
          ].join("\n"),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await confirmTiktokCatalogUpload({
      accessToken: "tok",
      advertiserId: "adv",
      bcId: "bc",
      catalogId: "cat",
      feedLogId: "1367200856",
      expectedSkuIds: ["A2504"],
      deps: { fetchImpl, maxAttempts: 1, intervalMs: 0, sleep: async () => undefined },
    });

    expect(result.verifiedVia).toBe("product_log");
    expect(result.succeeded).toBe(0);
    expect(result.errors[0]?.id).toBe("A2504");
    expect(result.errors[0]?.reason).toBe(
      "The number of api submit exceeds the limit (once a minute). You should wait a minute before submitting the data",
    );
    expect(result.errors[0]?.reason).not.toMatch(/https?:\/\//i);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("keeps polling product/log until feed_log CSV details are available", async () => {
    const csvUrl = "https://cdn.example.com/feed-en.csv";
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/catalog/product/log/")) {
        const callIndex = fetchImpl.mock.calls.filter((call) =>
          String(call[0]).includes("/catalog/product/log/"),
        ).length;
        if (callIndex === 1) {
          return new Response(
            JSON.stringify({
              code: 0,
              message: "OK",
              data: {
                process_status: "SUCCESS",
                add_count: 0,
                error_count: 0,
                end_time: "2026-07-17 08:02:01",
              },
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              product_feed_log: {
                add_count: 0,
                error_count: 0,
                end_time: "2026-07-17 08:02:05",
                feed_log_data: { en: csvUrl },
              },
            },
          }),
          { status: 200 },
        );
      }
      if (url === csvUrl) {
        return new Response(
          [
            "SKU ID,Line,Severity,Issue,How to fix",
            '"A2504","2","Warning","Missing google_product_category","Include product_type"',
          ].join("\n"),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await confirmTiktokCatalogUpload({
      accessToken: "tok",
      advertiserId: "adv",
      bcId: "bc",
      catalogId: "cat",
      feedLogId: "1367220791",
      expectedSkuIds: ["A2504"],
      deps: {
        fetchImpl,
        maxAttempts: 3,
        intervalMs: 0,
        sleep: async () => undefined,
      },
    });

    expect(result.succeeded).toBe(0);
    expect(result.errors[0]?.reason).toContain("Missing google_product_category");
    expect(
      fetchImpl.mock.calls.filter((call) => String(call[0]).includes("/catalog/product/log/"))
        .length,
    ).toBeGreaterThan(1);
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
