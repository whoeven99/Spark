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

  it("drives translate % from persisted resources, not the front-loaded node counter", () => {
    // Nodes (LLM-return) race ahead during the big-field long tail; the bar must
    // reflect blob-persisted resources so it can't show a misleading near-100%.
    const percent = computeTranslationV4ProgressPercent("TRANSLATING", {
      ...EMPTY_V4_METRICS,
      translateUnitDone: 90,
      translateUnitTotal: 100,
      translateDone: 5,
      translateTotal: 20,
    });
    expect(percent).toBe(25); // 5/20, not 90/100
  });

  it("falls back to node counters when no resource total is known", () => {
    const percent = computeTranslationV4ProgressPercent("TRANSLATING", {
      ...EMPTY_V4_METRICS,
      translateUnitDone: 25,
      translateUnitTotal: 100,
    });
    expect(percent).toBe(25);
  });

  it("surfaces a 收尾 hint when nodes are ~done but resources still finishing", () => {
    const summary = buildTranslationV4StageSummary("TRANSLATING", {
      ...EMPTY_V4_METRICS,
      translateUnitDone: 98,
      translateUnitTotal: 100,
      translateDone: 17,
      translateTotal: 20,
      currentModule: "PRODUCT",
      translateStartedAt: null,
      progressUpdatedAt: null,
    });
    expect(summary).toContain("正在收尾 3 项");
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
    expect(summary).toContain("子节点 25/100");
    expect(summary).toContain("5/20");
    expect(summary).not.toContain("资源");
    expect(summary).toContain("当前模块 PRODUCT");
  });
});
