import { describe, expect, it } from "vitest";
import {
  buildTranslationV4StageSummary,
  computeTranslationV4ProgressPercent,
  mergeV4JobMetrics,
  translationV4StatusLabel,
} from "~/server/translation/v4/v4JobProgress.server";
import { EMPTY_V4_METRICS, type TranslationV4Job } from "~/server/translation/v4/types";

function baseJob(overrides: Partial<TranslationV4Job> = {}): TranslationV4Job {
  return {
    id: "job-1",
    shopName: "demo.myshopify.com",
    shopifyAccessToken: "token",
    source: "zh-CN",
    target: "ja",
    modules: ["PRODUCT"],
    aiModel: "gpt-4o-mini",
    aiModelUsed: null,
    aiProvider: null,
    engineUsage: null,
    limitPerType: 20,
    isCover: false,
    isHandle: false,
    testMode: false,
    status: "TRANSLATING",
    claimedBy: "worker-1",
    claimedAt: null,
    lastHeartbeat: null,
    blobPrefix: "tasks/v4/demo/job-1",
    metrics: { ...EMPTY_V4_METRICS },
    errorMessage: null,
    errorStage: null,
    createdBy: "demo.myshopify.com",
    createdAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-08T00:05:00.000Z",
    ...overrides,
  };
}

describe("v4JobProgress.server", () => {
  it("merges redis counters over cosmos metrics", () => {
    const job = baseJob({
      metrics: {
        ...EMPTY_V4_METRICS,
        translateDone: 1,
        translateTotal: 10,
      },
    });
    const merged = mergeV4JobMetrics(job, {
      translateDone: "4",
      translateTotal: "10",
      currentModule: "PRODUCT",
    });
    expect(merged.translateDone).toBe(4);
    expect(merged.currentModule).toBe("PRODUCT");
  });

  it("computes translate progress from node counters when available", () => {
    const percent = computeTranslationV4ProgressPercent("TRANSLATING", {
      ...EMPTY_V4_METRICS,
      translateUnitDone: 25,
      translateUnitTotal: 100,
    });
    expect(percent).toBe(25);
  });

  it("builds readable stage summary for translating jobs", () => {
    const summary = buildTranslationV4StageSummary("TRANSLATING", {
      ...EMPTY_V4_METRICS,
      translateUnitDone: 25,
      translateUnitTotal: 100,
      translateDone: 5,
      translateTotal: 20,
      currentModule: "PRODUCT",
      translateStartedAt: null,
      progressUpdatedAt: null,
    });
    expect(summary).toContain(translationV4StatusLabel("TRANSLATING"));
    expect(summary).toContain("节点 25/100");
    expect(summary).toContain("当前模块 PRODUCT");
  });
});
