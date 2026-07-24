import { describe, expect, it } from "vitest";
import { buildWorkspaceTaskSummaries } from "~/server/operations/workspaceTaskSummary.server";
import type { UnifiedTaskEntry } from "~/lib/unifiedTaskTypes";

describe("buildWorkspaceTaskSummaries", () => {
  it("summarizes ai_task entries", () => {
    const entries: UnifiedTaskEntry[] = [
      {
        entryType: "ai_task",
        task: {
          id: "task-1",
          batchId: "batch-1",
          shop: "test.myshopify.com",
          taskType: "product_improve",
          status: "succeeded",
          config: { products: [{ id: "1" }, { id: "2" }] },
          result: null,
          estimatedCredits: null,
          actualCredits: null,
          startedAt: "2026-06-12T08:00:00.000Z",
          completedAt: "2026-06-12T08:05:00.000Z",
          errorMsg: null,
          createdAt: "2026-06-12T08:00:00.000Z",
          updatedAt: "2026-06-12T08:05:00.000Z",
        },
      },
    ];
    const summaries = buildWorkspaceTaskSummaries(entries);
    expect(summaries[0]?.title).toBe("商品文案优化");
    expect(summaries[0]?.result).toContain("已完成");
    expect(summaries[0]?.result).toContain("2 个商品");
  });
});
