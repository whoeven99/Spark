import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTranslationJobRecord: vi.fn(),
  listTranslationJobs: vi.fn(),
}));

vi.mock("./cosmosJobStore.server", () => ({
  createTranslationJobRecord: mocks.createTranslationJobRecord,
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
    mocks.createTranslationJobRecord.mockImplementation(async (input) => ({
      id: input.id,
      shop: input.shop,
      status: "PENDING",
      sourceLocale: input.sourceLocale,
      targetLocale: input.targetLocale,
      taskType: input.taskType ?? "spark",
      aiModel: input.aiModel ?? "gpt-4o-mini",
      isCover: false,
      isHandle: false,
      moduleList: input.resourceTypes,
      sessionId: input.sessionId ?? `${input.shop}:${input.id}`,
      checkpoint: input.checkpoint ?? {},
      metrics: input.metrics ?? {},
      resourceTypes: input.resourceTypes,
      limitPerType: input.limitPerType,
      totalItems: 0,
      fetchedItems: 0,
      errorMessage: null,
      createdBy: input.createdBy,
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
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
        taskType: "spark",
      }),
    );
    expect(result?.id).toBeDefined();
    expect(result?.status).toBe("PENDING");
  });
});
