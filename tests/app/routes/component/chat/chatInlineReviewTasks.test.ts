import { describe, expect, it } from "vitest";
import {
  isChatInlineReviewTask,
  resolveChatReviewDialogTitleKey,
  resolveInlineReviewOptions,
} from "../../../../../app/routes/component/chat/chatInlineReviewTasks";
import { TASK_RUN_VERSION, type TaskRunPayload } from "../../../../../app/lib/taskRunPayload";
import { BATCH_PRODUCT_IMPROVE_SKILL_ID } from "../../../../../app/lib/taskProposalPayload";
import type { AITaskItem, AITaskStatus, AITaskType } from "../../../../../app/lib/aiTaskTypes";

const run = (overrides: Partial<TaskRunPayload> = {}): TaskRunPayload => ({
  version: TASK_RUN_VERSION,
  runId: "run-1",
  skillId: "bulk_price_edit",
  title: "批量调价",
  taskIds: ["t1"],
  errors: [],
  paramsSummary: [],
  startedAt: "2026-09-01T00:00:00.000Z",
  ...overrides,
});

const task = (
  id: string,
  taskType: AITaskType,
  status: AITaskStatus,
): AITaskItem =>
  ({
    id,
    taskType,
    status,
    shop: "test.myshopify.com",
    config: {},
    result: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  }) as unknown as AITaskItem;

describe("isChatInlineReviewTask", () => {
  it("covers the four task types reviewable inside the chat", () => {
    expect(isChatInlineReviewTask("product_improve")).toBe(true);
    expect(isChatInlineReviewTask("picture_translate")).toBe(true);
    expect(isChatInlineReviewTask("image_generation")).toBe(true);
    expect(isChatInlineReviewTask("bulk_price_edit")).toBe(true);
  });

  it("rejects unknown and empty task types", () => {
    expect(isChatInlineReviewTask("ads_catalog_sync")).toBe(false);
    expect(isChatInlineReviewTask(null)).toBe(false);
    expect(isChatInlineReviewTask(undefined)).toBe(false);
  });
});

describe("resolveChatReviewDialogTitleKey", () => {
  it("uses a dedicated title for bulk price edit", () => {
    expect(resolveChatReviewDialogTitleKey("bulk_price_edit")).toBe(
      "bulkPriceEdit.reviewTitleShort",
    );
  });

  it("falls back to the shared review title", () => {
    expect(resolveChatReviewDialogTitleKey("product_improve")).toBe(
      "productImproveStage1.chatReviewDialogTitle",
    );
    expect(resolveChatReviewDialogTitleKey(undefined)).toBe(
      "productImproveStage1.chatReviewDialogTitle",
    );
  });
});

describe("resolveInlineReviewOptions", () => {
  it("routes a pending bulk price edit task to the inline dialog", () => {
    const opts = resolveInlineReviewOptions(run(), [
      task("t1", "bulk_price_edit", "pending_review"),
    ]);
    expect(opts).toEqual({
      skillId: "bulk_price_edit",
      taskType: "bulk_price_edit",
      taskId: "t1",
      taskIds: ["t1"],
      intent: "review",
    });
  });

  it("picks the first pending task and keeps its siblings for dialog navigation", () => {
    const opts = resolveInlineReviewOptions(
      run({ skillId: BATCH_PRODUCT_IMPROVE_SKILL_ID, taskIds: ["t1", "t2", "t3"] }),
      [
        task("t1", "product_improve", "applied"),
        task("t2", "product_improve", "pending_review"),
        task("t3", "product_improve", "pending_review"),
      ],
    );
    expect(opts?.taskId).toBe("t2");
    expect(opts?.taskIds).toEqual(["t1", "t2", "t3"]);
  });

  it("still offers review for batch product improve before task snapshots arrive", () => {
    const opts = resolveInlineReviewOptions(
      run({ skillId: BATCH_PRODUCT_IMPROVE_SKILL_ID }),
      [task("t1", "product_improve", "succeeded")],
    );
    expect(opts?.taskType).toBe("product_improve");
    expect(opts?.taskId).toBe("t1");
  });

  it("gives no entry when nothing is pending and the skill is not product improve", () => {
    expect(
      resolveInlineReviewOptions(run(), [task("t1", "bulk_price_edit", "applied")]),
    ).toBeUndefined();
  });

  it("gives no entry for task types that cannot be reviewed in the chat", () => {
    expect(
      resolveInlineReviewOptions(run({ skillId: "ads_catalog_sync" }), [
        task("t1", "ads_catalog_sync", "pending_review"),
      ]),
    ).toBeUndefined();
  });

  it("gives no entry when no task snapshot is available at all", () => {
    expect(resolveInlineReviewOptions(run(), [])).toBeUndefined();
  });
});
