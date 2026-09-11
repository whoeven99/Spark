import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AITaskItem } from "../../../../../app/lib/aiTaskTypes";

vi.mock("../../../../../app/routes/component/catalogManage/catalogReviewUi", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../../../../app/routes/component/catalogManage/catalogReviewUi")
  >();
  return {
    ...actual,
    downloadCatalogCsv: vi.fn(),
  };
});

import { downloadCatalogCsv } from "../../../../../app/routes/component/catalogManage/catalogReviewUi";
import {
  downloadProductExportCsv,
  productExportDownloadFilename,
  productExportSkipDownloadFilename,
  readProductExportResult,
} from "../../../../../app/routes/component/productExport/ProductExportTaskDetailPage";

const downloadCatalogCsvMock = vi.mocked(downloadCatalogCsv);

function exportTask(result: Record<string, unknown> | null): AITaskItem {
  return {
    id: "abcdef12-3456-7890",
    taskType: "product_export",
    status: "succeeded",
    shop: "test.myshopify.com",
    config: {},
    result,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  } as unknown as AITaskItem;
}

describe("productExport download helpers", () => {
  beforeEach(() => {
    downloadCatalogCsvMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("builds a csv filename from the task id and format", () => {
    expect(productExportDownloadFilename("abcdef12-3456-7890", "shopify_csv")).toBe(
      "product-export-shopify-abcdef12.csv",
    );
    expect(productExportDownloadFilename("abcdef12-3456-7890", "tiktok_csv")).toBe(
      "product-export-tiktok-abcdef12.csv",
    );
    expect(productExportDownloadFilename("abcdef12-3456-7890", "amazon_csv")).toBe(
      "product-export-amazon-abcdef12.csv",
    );
    expect(productExportDownloadFilename("abcdef12-3456-7890", "tiktok_shop_csv")).toBe(
      "product-export-tiktok-shop-abcdef12.csv",
    );
    expect(productExportSkipDownloadFilename("abcdef12-3456-7890")).toBe(
      "product-export-skip-abcdef12.csv",
    );
  });

  it("downloads immediately when the task snapshot already has csv", async () => {
    const task = exportTask({ csv: "Handle,Title\nshirt,Shirt", format: "shopify_csv" });
    await expect(downloadProductExportCsv(task, "")).resolves.toBe(true);
    expect(downloadCatalogCsvMock).toHaveBeenCalledWith(
      "product-export-shopify-abcdef12.csv",
      "Handle,Title\nshirt,Shirt",
    );
  });

  it("fetches the task when the snapshot has no csv", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          task: exportTask({ csv: "Handle,Title\nfetched,Fetched", format: "tiktok_csv" }),
        }),
      }),
    );
    const task = exportTask(null);
    await expect(downloadProductExportCsv(task, "?shop=test")).resolves.toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/ai-task/abcdef12-3456-7890?shop=test",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(downloadCatalogCsvMock).toHaveBeenCalledWith(
      "product-export-tiktok-abcdef12.csv",
      "Handle,Title\nfetched,Fetched",
    );
  });

  it("returns false when csv is still missing after fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ task: exportTask(null) }),
      }),
    );
    await expect(downloadProductExportCsv(exportTask(null), "")).resolves.toBe(false);
    expect(downloadCatalogCsvMock).not.toHaveBeenCalled();
  });

  it("treats a missing csv string as no result", () => {
    expect(readProductExportResult(exportTask({ summary: { exported: 1 } }))).toBeNull();
  });
});
