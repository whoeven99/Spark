/**
 * 哪些任务类型可以在对话里直接审核。
 *
 * prod 导航不展示任务页（见 app/config/appEntry.server.ts），
 * 所以待审核任务的验收入口必须留在对话内：进度卡据此决定是否给「去审核」，
 * ChatPanel 据此决定是否开 DialogShell 而不是跳 /app/tasks。
 * 新增可对话内审核的任务类型时，这里和 ChatPanel 的渲染分支要一起加。
 */
import type { AITaskItem } from "../../../lib/aiTaskTypes";
import type { TaskRunPayload } from "../../../lib/taskRunPayload";
import type { OpenWorkspaceTasksOptions } from "../../../lib/productImproveDeepLink";
import { BATCH_PRODUCT_IMPROVE_SKILL_ID } from "../../../lib/taskProposalPayload";

const CHAT_INLINE_REVIEW_TASK_TYPES = new Set([
  "product_improve",
  "picture_translate",
  "image_generation",
  "bulk_price_edit",
  "bulk_tag_edit",
  "bulk_status_edit",
  "product_export",
  "product_import",
]);

export function isChatInlineReviewTask(taskType?: string | null): boolean {
  return Boolean(taskType && CHAT_INLINE_REVIEW_TASK_TYPES.has(taskType));
}

const REVIEW_DIALOG_TITLE_KEYS: Record<string, string> = {
  bulk_price_edit: "bulkPriceEdit.reviewTitleShort",
  bulk_tag_edit: "bulkTagEdit.reviewTitleShort",
  bulk_status_edit: "bulkStatusEdit.reviewTitleShort",
  product_export: "productExport.reviewTitleShort",
  product_import: "productImport.reviewTitleShort",
};

/** 审核弹窗标题：默认沿用商品文案那套「审核结果」，特殊类型可覆盖。 */
export function resolveChatReviewDialogTitleKey(taskType?: string | null): string {
  if (taskType && REVIEW_DIALOG_TITLE_KEYS[taskType]) {
    return REVIEW_DIALOG_TITLE_KEYS[taskType];
  }
  return "productImproveStage1.chatReviewDialogTitle";
}

/** 导出完成后也要在对话里给结果入口。 */
export function resolveSucceededProductExportTask(
  matchedTasks: AITaskItem[],
): AITaskItem | undefined {
  return matchedTasks.find(
    (task) => task.taskType === "product_export" && task.status === "succeeded",
  );
}

function resolveInlineReviewTask(matchedTasks: AITaskItem[]): AITaskItem | undefined {
  return (
    matchedTasks.find(
      (task) => task.status === "pending_review" && isChatInlineReviewTask(task.taskType),
    ) ?? matchedTasks.find((task) => isChatInlineReviewTask(task.taskType))
  );
}

/**
 * 找出这一轮里可以在对话内审核/预览的任务类型。
 *
 * 进行中、待审核、已结束（含失败）都可以打开同一套详情弹窗。
 * 同一轮任务类型是同质的，优先待审核项。
 */
function resolveInlineReviewTaskType(
  run: TaskRunPayload,
  matchedTasks: AITaskItem[],
): string | undefined {
  const matched = resolveInlineReviewTask(matchedTasks);
  if (matched?.taskType) return matched.taskType;
  if (run.skillId === BATCH_PRODUCT_IMPROVE_SKILL_ID) return "product_improve";
  return undefined;
}

/** 进度卡「去审核」要带的参数；返回 undefined 表示这一轮不该给审核入口。 */
export function resolveInlineReviewOptions(
  run: TaskRunPayload,
  matchedTasks: AITaskItem[],
): OpenWorkspaceTasksOptions | undefined {
  const taskType = resolveInlineReviewTaskType(run, matchedTasks);
  if (!taskType) return undefined;
  const sameTypeTasks = matchedTasks.filter((task) => task.taskType === taskType);
  const firstPending = sameTypeTasks.find((task) => task.status === "pending_review");
  const taskId = firstPending?.id ?? sameTypeTasks[0]?.id ?? matchedTasks[0]?.id;
  if (!taskId) return undefined;
  const reviewTaskIds = sameTypeTasks.map((task) => task.id);
  return {
    skillId: run.skillId,
    taskType,
    taskId,
    ...(reviewTaskIds.length > 0 ? { taskIds: reviewTaskIds } : {}),
    intent: "review",
  };
}
