import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTranslationJobRecord: vi.fn(),
  getTranslationJobRecord: vi.fn(),
  listTranslationJobs: vi.fn(),
  resetTranslationJobRecord: vi.fn(),
}));

vi.mock("./cosmosJobStore.server", () => ({
  createTranslationJobRecord: mocks.createTranslationJobRecord,
  getTranslationJobRecord: mocks.getTranslationJobRecord,
  listTranslationJobs: mocks.listTranslationJobs,
  resetTranslationJobRecord: mocks.resetTranslationJobRecord,
}));

import { createTranslationJob } from "./translationPipelineCore.server";

describe("createTranslationJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listTranslationJobs.mockResolvedValue([]);
  });

  it("同语种旧任务复用时 reset，不落库新 job", async () => {
    mocks.listTranslationJobs.mockResolvedValue([
      { id: "job-old", sourceLocale: "en", targetLocale: "fr", status: "FAILED" },
    ]);
    mocks.getTranslationJobRecord.mockResolvedValue({ id: "job-old", status: "PENDING" });

    const result = await createTranslationJob({
      shop: "demo-shop",
      sourceLocale: "en",
      targetLocale: "fr",
      resourceTypes: ["product"],
      createdBy: "tester",
      limitPerType: 30,
    });

    expect(mocks.resetTranslationJobRecord).toHaveBeenCalledWith(
      "demo-shop",
      "job-old",
      expect.objectContaining({
        sourceLocale: "en",
        targetLocale: "fr",
        limitPerType: 30,
        taskType: "json-runtime",
      }),
    );
    expect(mocks.createTranslationJobRecord).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ id: "job-old" }));
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
    expect(mocks.resetTranslationJobRecord).not.toHaveBeenCalled();
    expect(result?.id).toBeDefined();
    expect(result?.status).toBe("PENDING");
  });
});
