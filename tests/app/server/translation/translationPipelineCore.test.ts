import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTranslationJobRecord: vi.fn(),
  listTranslationJobs: vi.fn(),
  updateTranslationJobRecord: vi.fn(),
}));

vi.mock("~/server/translation/cosmosJobStore.server", () => ({
  createTranslationJobRecord: mocks.createTranslationJobRecord,
  listTranslationJobs: mocks.listTranslationJobs,
  updateTranslationJobRecord: mocks.updateTranslationJobRecord,
  logTranslationCosmosTarget: vi.fn(),
  getTranslationJobsCosmosLocation: vi.fn(() => ({
    endpoint: "",
    databaseId: "translation",
    containerId: "translation_jobs",
    partitionKeyPath: "/shopName",
    cosmosKeySuffix: "****",
  })),
}));

import { createTranslationJob } from "../../../../app/server/translation/translationPipelineCore.server";

const baseExisting = {
  shop: "demo-shop",
  status: "PENDING" as const,
  taskType: "spark",
  aiModel: "gpt-4o-mini",
  isCover: false,
  isHandle: false,
  moduleList: ["PRODUCT"],
  sessionId: "s",
  checkpoint: {},
  metrics: {},
  resourceTypes: ["PRODUCT"],
  limitPerType: 20,
  totalItems: 0,
  fetchedItems: 0,
  errorMessage: null as string | null,
  createdBy: "tester",
  createdAt: "2020-01-01T00:00:00.000Z",
  updatedAt: "2020-01-02T00:00:00.000Z",
};

describe("createTranslationJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listTranslationJobs.mockResolvedValue([]);
  });

  it("同店同源同目标已存在时幂等返回已有任务，不再写入 Cosmos", async () => {
    mocks.listTranslationJobs.mockResolvedValue([
      {
        ...baseExisting,
        id: "job-old",
        sourceLocale: "en",
        targetLocale: "fr",
      },
    ]);

    const result = await createTranslationJob({
      shop: "demo-shop",
      sourceLocale: "en",
      targetLocale: "fr",
      resourceTypes: ["product"],
      createdBy: "tester",
      limitPerType: 30,
    });

    expect(mocks.createTranslationJobRecord).not.toHaveBeenCalled();
    expect(mocks.updateTranslationJobRecord).not.toHaveBeenCalled();
    expect(result.reusedExisting).toBe(true);
    expect(result.job.id).toBe("job-old");
  });

  it("幂等复用已有任务时刷新 checkpoint.shopifyAccessToken", async () => {
    mocks.listTranslationJobs.mockResolvedValue([
      {
        ...baseExisting,
        id: "job-old",
        sourceLocale: "en",
        targetLocale: "fr",
        checkpoint: { phase: "INIT_CREATED" },
      },
    ]);
    mocks.updateTranslationJobRecord.mockResolvedValue({
      ...baseExisting,
      id: "job-old",
      sourceLocale: "en",
      targetLocale: "fr",
      checkpoint: { phase: "INIT_CREATED", shopifyAccessToken: "shpat_refreshed" },
    });

    const result = await createTranslationJob({
      shop: "demo-shop",
      sourceLocale: "en",
      targetLocale: "fr",
      resourceTypes: ["PRODUCT"],
      createdBy: "tester",
      limitPerType: 20,
      shopifyAccessToken: "shpat_refreshed",
    });

    expect(mocks.updateTranslationJobRecord).toHaveBeenCalledWith(
      "demo-shop",
      "job-old",
      expect.objectContaining({
        checkpoint: expect.objectContaining({ shopifyAccessToken: "shpat_refreshed" }),
      }),
    );
    expect(result.reusedExisting).toBe(true);
    expect(result.job.checkpoint).toMatchObject({ shopifyAccessToken: "shpat_refreshed" });
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
    expect(result.reusedExisting).toBe(false);
    expect(result.job.id).toBeDefined();
    expect(result.job.status).toBe("PENDING");
  });

  it("新建任务时将 shopifyAccessToken 写入 checkpoint", async () => {
    mocks.createTranslationJobRecord.mockImplementation(async (input) => ({
      id: input.id,
      shop: input.shop,
      status: "PENDING",
      sourceLocale: input.sourceLocale,
      targetLocale: input.targetLocale,
      taskType: "spark",
      aiModel: "gpt-4o-mini",
      isCover: false,
      isHandle: false,
      moduleList: input.resourceTypes,
      sessionId: input.sessionId,
      checkpoint: input.checkpoint ?? {},
      metrics: {},
      resourceTypes: input.resourceTypes,
      limitPerType: input.limitPerType,
      totalItems: 0,
      fetchedItems: 0,
      errorMessage: null,
      createdBy: input.createdBy,
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    }));

    await createTranslationJob({
      shop: "demo-shop",
      sourceLocale: "en",
      targetLocale: "fr",
      resourceTypes: ["PRODUCT"],
      createdBy: "tester",
      limitPerType: 20,
      shopifyAccessToken: "shpat_test_token",
    });

    expect(mocks.createTranslationJobRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        checkpoint: expect.objectContaining({
          shopifyAccessToken: "shpat_test_token",
        }),
      }),
    );
  });

  it("大小写不同的 locale 仍视为同一语言对", async () => {
    mocks.listTranslationJobs.mockResolvedValue([
      {
        ...baseExisting,
        id: "job-zh-fr",
        sourceLocale: "zh-CN",
        targetLocale: "FR",
      },
    ]);

    const result = await createTranslationJob({
      shop: "demo-shop",
      sourceLocale: "zh-cn",
      targetLocale: "fr",
      resourceTypes: ["PRODUCT"],
      createdBy: "tester",
      limitPerType: 20,
    });

    expect(result.reusedExisting).toBe(true);
    expect(result.job.id).toBe("job-zh-fr");
    expect(mocks.createTranslationJobRecord).not.toHaveBeenCalled();
  });
});
