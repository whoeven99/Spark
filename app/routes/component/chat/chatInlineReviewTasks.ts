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
  "bulk_collection_edit",
  "bulk_seo_edit",
  "bulk_metafield_edit",
  "bulk_price_import",
  "bulk_cost_import",
  "bulk_inventory_import",
]);

export function isChatInlineReviewTask(taskType?: string | null): boolean {
  return Boolean(taskType && CHAT_INLINE_REVIEW_TASK_TYPES.has(taskType));
}

const REVIEW_DIALOG_TITLE_KEYS: Record<string, string> = {
  bulk_price_edit: "bulkPriceEdit.reviewTitleShort",
  bulk_tag_edit: "bulkTagEdit.reviewTitleShort",
  bulk_status_edit: "bulkStatusEdit.reviewTitleShort",
  bulk_collection_edit: "bulkCollectionEdit.reviewTitleShort",
  bulk_seo_edit: "bulkSeoEdit.reviewTitleShort",
  bulk_metafield_edit: "bulkMetafieldEdit.reviewTitleShort",
  bulk_price_import: "bulkPriceImport.reviewTitleShort",
  bulk_cost_import: "bulkCostImport.reviewTitleShort",
  bulk_inventory_import: "bulkInventoryImport.reviewTitleShort",
};

/** 审核弹窗标题：默认沿用商品文案那套「审核结果」，特殊类型可覆盖。 */
export function resolveChatReviewDialogTitleKey(taskType?: string | null): string {
  if (taskType && REVIEW_DIALOG_TITLE_KEYS[taskType]) {
    return REVIEW_DIALOG_TITLE_KEYS[taskType];
  }
  return "productImproveStage1.chatReviewDialogTitle";
}

/**
 * 找出这一轮里可以在对话内审核的任务类型。
 *
 * 只要任务类型支持对话内审核就给入口，不再只认商品文案。
 * 同一轮任务类型是同质的，取第一个待审核项的类型即可。
 */
function resolveInlineReviewTaskType(
  run: TaskRunPayload,
  matchedTasks: AITaskItem[],
): string | undefined {
  const pending = matchedTasks.find(
    (task) => task.status === "pending_review" && isChatInlineReviewTask(task.taskType),
  );
  if (pending?.taskType) return pending.taskType;
  // 批量商品文案在任务快照还没到位时也要给入口
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
