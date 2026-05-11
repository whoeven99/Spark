import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTranslationJobRecord: vi.fn(),
  getTranslationJobRecord: vi.fn(),
  listTranslationJobs: vi.fn(),
}));

vi.mock("./cosmosJobStore.server", () => ({
  createTranslationJobRecord: mocks.createTranslationJobRecord,
  getTranslationJobRecord: mocks.getTranslationJobRecord,
  listTranslationJobs: mocks.listTranslationJobs,
}));

import { createTranslationJob } from "./translationPipelineCore.server";

describe("createTranslationJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listTranslationJobs.mockResolvedValue([]);
  });

  it("同店同源同目标在 Cosmos 已存在时拒绝创建", async () => {
    mocks.listTranslationJobs.mockResolvedValue([
      { id: "job-old", sourceLocale: "en", targetLocale: "fr", status: "FAILED" },
    ]);

    await expect(
      createTranslationJob({
        shop: "demo-shop",
        sourceLocale: "en",
        targetLocale: "fr",
        resourceTypes: ["product"],
        createdBy: "tester",
        limitPerType: 30,
      }),
    ).rejects.toThrow("任务已存在");

    expect(mocks.createTranslationJobRecord).not.toHaveBeenCalled();
  });

  it("无历史任务时新建 Cosmos 记录", async () => {
    mocks.listTranslationJobs.mockResolvedValue([]);
    mocks.createTranslationJobRecord.mockResolvedValue(undefined);
    mocks.getTranslationJobRecord.mockImplementation(async (_shop: string, jobId: string) => ({
      id: jobId,
      status: "PENDING",
    }));

    const result = await createTranslationJob({
      shop: "demo-shop",
      sourceLocale: "en",
      targetLocale: "de",
      resourceTypes: ["PRODUCT"],
      createdBy: "tester",
      limitPerType: 20,
    });

    expect(mocks.createTranslationJobRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        shop: "demo-shop",
        sourceLocale: "en",
        targetLocale: "de",
        limitPerType: 20,
        taskType: "json-runtime",
      }),
    );
    expect(result?.id).toBeDefined();
    expect(result?.status).toBe("PENDING");
  });
});
