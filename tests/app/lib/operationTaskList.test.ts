import { describe, expect, it } from "vitest";
import {
  getOperationTaskAttentionTimestamp,
  isOperationTaskCurrent,
  isOperationTaskHistory,
} from "../../../app/lib/operationTaskList";
import type { OperationTaskView } from "../../../app/server/operations/dailyInspection.server";

function createTask(overrides: Partial<OperationTaskView> = {}): OperationTaskView {
  return {
    id: "op-task-1",
    dedupeKey: "inventory_risk:risk_skus:inventory_loss:today",
    sourceKey: "inventory_risk",
    title: "补货止损",
    quadrant: "q1",
    priority: "P0",
    status: "open",
    triggerReason: "库存风险上升",
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

describe("operation task list helpers", () => {
  it("keeps active operation tasks in current view even after 24 hours", () => {
    const task = createTask({
      status: "in_progress",
      createdAt: "2026-08-18T08:00:00.000Z",
    });
    const now = new Date("2026-08-20T12:00:00.000Z");

    expect(isOperationTaskCurrent(task, now)).toBe(true);
    expect(isOperationTaskHistory(task, now)).toBe(false);
  });

  it("keeps recently closed tasks in current view based on resolvedAt", () => {
    const task = createTask({
      status: "done",
      createdAt: "2026-08-15T08:00:00.000Z",
      resolvedAt: "2026-08-20T06:00:00.000Z",
    });
    const now = new Date("2026-08-20T12:00:00.000Z");

    expect(getOperationTaskAttentionTimestamp(task)).toBe(
      new Date("2026-08-20T06:00:00.000Z").getTime(),
    );
    expect(isOperationTaskCurrent(task, now)).toBe(true);
  });

  it("moves closed tasks to history after the attention window", () => {
    const task = createTask({
      status: "ignored",
      createdAt: "2026-08-18T08:00:00.000Z",
      resolvedAt: "2026-08-19T08:00:00.000Z",
    });
    const now = new Date("2026-08-20T12:01:00.000Z");

    expect(isOperationTaskCurrent(task, now)).toBe(false);
    expect(isOperationTaskHistory(task, now)).toBe(true);
  });
});
