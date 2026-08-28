import { describe, expect, it } from "vitest";
import type { AITaskItem } from "../../../app/lib/aiTaskTypes";
import {
  mergeFetchedAiTask,
  shouldKeepPollingAiTaskStatus,
  shouldRetainLocalAiTaskStatus,
} from "../../../app/lib/aiTaskStatusSync";

function item(status: AITaskItem["status"]): AITaskItem {
  return {
    id: "task-1",
    batchId: "batch-1",
    shop: "demo.myshopify.com",
    taskType: "product_improve",
    status,
    config: {},
    result: { title: "t" },
    estimatedCredits: null,
    actualCredits: null,
    startedAt: "2026-08-28T00:00:00.000Z",
    completedAt: "2026-08-28T00:01:00.000Z",
    errorMsg: null,
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-28T00:01:00.000Z",
  };
}

describe("shouldKeepPollingAiTaskStatus", () => {
  it("keeps polling while the merchant still needs to review or apply", () => {
    expect(shouldKeepPollingAiTaskStatus("running")).toBe(true);
    expect(shouldKeepPollingAiTaskStatus("pending_review")).toBe(true);
    expect(shouldKeepPollingAiTaskStatus("scored")).toBe(true);
  });

  it("stops polling after apply, success, or failure", () => {
    expect(shouldKeepPollingAiTaskStatus("applied")).toBe(false);
    expect(shouldKeepPollingAiTaskStatus("succeeded")).toBe(false);
    expect(shouldKeepPollingAiTaskStatus("failed")).toBe(false);
    expect(shouldKeepPollingAiTaskStatus("cancelled")).toBe(false);
  });
});

describe("shouldRetainLocalAiTaskStatus", () => {
  it("keeps applied when a stale pending_review snapshot arrives", () => {
    expect(shouldRetainLocalAiTaskStatus("applied", "pending_review")).toBe(true);
  });

  it("does not block legitimate transitions", () => {
    expect(shouldRetainLocalAiTaskStatus("pending_review", "applied")).toBe(false);
    expect(shouldRetainLocalAiTaskStatus("applied", "applied")).toBe(false);
    expect(shouldRetainLocalAiTaskStatus("pending_review", "pending_review")).toBe(false);
  });
});

describe("mergeFetchedAiTask", () => {
  it("does not roll an applied task back to pending_review", () => {
    const merged = mergeFetchedAiTask(item("applied"), item("pending_review"));
    expect(merged.status).toBe("applied");
  });

  it("accepts a newer applied snapshot", () => {
    const incoming = { ...item("applied"), result: { title: "new" } };
    const merged = mergeFetchedAiTask(item("pending_review"), incoming);
    expect(merged.status).toBe("applied");
    expect(merged.result).toEqual({ title: "new" });
  });
});
