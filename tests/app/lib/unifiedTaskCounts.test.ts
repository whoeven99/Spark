import { describe, expect, it } from "vitest";
import { computeUnifiedTaskTabCounts } from "../../../app/lib/unifiedTaskCounts";
import type { OperationTaskView } from "../../../app/server/operations/dailyInspection.server";

function createTask(overrides: Partial<OperationTaskView> = {}): OperationTaskView {
  return {
    id: "op-task-1",
    dedupeKey: "inventory_risk:risk_skus:inventory_loss:today",
    sourceKey: "inventory_risk",
    sourceType: "rule",
    title: "补货止损",
    quadrant: "q1",
    priority: "P0",
    status: "open",
    triggerReason: "库存风险上升",
    objective: null,
    impactMetrics: [],
    estimatedLift: null,
    roiImpactSummary: null,
    confidence: null,
    riskEnvironment: null,
    aiContextPayload: null,
    relatedObjects: {},
    suggestedActions: ["按预估损失排序补货"],
    ownerRole: "供应链",
    dueWindow: "today",
    dueAt: null,
    createdAt: "2026-08-19T08:00:00.000Z",
    resolvedAt: null,
    ...overrides,
  };
}

describe("computeUnifiedTaskTabCounts", () => {
  const now = new Date("2026-08-20T12:00:00.000Z");

  it("includes scheduled automation tasks in currentCount even when history view hides them", () => {
    const counts = computeUnifiedTaskTabCounts({
      aiCurrentCount: 1,
      aiHistoryCount: 93,
      operationTasks: [],
      scheduledAutomationCount: 3,
      now,
    });

    expect(counts).toEqual({ currentCount: 4, historyCount: 93 });
  });

  it("adds current operation tasks without mixing them into historyCount", () => {
    const counts = computeUnifiedTaskTabCounts({
      aiCurrentCount: 1,
      aiHistoryCount: 10,
      operationTasks: [
        createTask({ id: "open-1", status: "open" }),
        createTask({
          id: "old-closed",
          status: "done",
          createdAt: "2026-08-10T08:00:00.000Z",
          resolvedAt: "2026-08-10T09:00:00.000Z",
        }),
      ],
      scheduledAutomationCount: 3,
      now,
    });

    expect(counts).toEqual({ currentCount: 5, historyCount: 11 });
  });

  it("excludes scheduled automation when filtering by operation source", () => {
    const counts = computeUnifiedTaskTabCounts({
      aiCurrentCount: 1,
      aiHistoryCount: 93,
      operationTasks: [
        createTask({ id: "match", sourceKey: "inventory_risk", status: "open" }),
        createTask({ id: "other", sourceKey: "refund_spike", status: "open" }),
      ],
      scheduledAutomationCount: 3,
      operationSourceFilter: ["inventory_risk"],
      now,
    });

    expect(counts).toEqual({ currentCount: 1, historyCount: 0 });
  });
});
