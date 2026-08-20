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

  it("summarizes operation_task entries", () => {
    const entries: UnifiedTaskEntry[] = [
      {
        entryType: "operation_task",
        task: {
          id: "op-task-1",
          dedupeKey: "growth_focus:high_value_segment:ltv:this_week",
          sourceKey: "report:growth_focus",
          title: "放大利润与高价值客群",
          quadrant: "q3",
          priority: "P1",
          status: "open",
          triggerReason: "高价值客群和利润渠道已经形成结构优势。",
          relatedObjects: {},
          suggestedActions: ["优先圈定高价值客群并规划二次触达。"],
          ownerRole: "运营",
          dueWindow: "this_week",
          dueAt: null,
          createdAt: "2026-08-20T08:00:00.000Z",
          resolvedAt: null,
        },
      },
    ];

    const summaries = buildWorkspaceTaskSummaries(entries);

    expect(summaries[0]?.title).toBe("放大利润与高价值客群");
    expect(summaries[0]?.result).toContain("P1");
    expect(summaries[0]?.result).toContain("待处理");
    expect(summaries[0]?.result).toContain("优先圈定高价值客群并规划二次触达。");
  });
});
