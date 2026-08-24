import type { OperationTaskView } from "../server/operations/dailyInspection.server";

const CURRENT_TASK_WINDOW_MS = 24 * 60 * 60 * 1000;

function isClosedOperationTask(status: OperationTaskView["status"]) {
  return status === "done" || status === "ignored" || status === "auto_closed";
}

export function getOperationTaskAttentionTimestamp(task: OperationTaskView): number {
  if (isClosedOperationTask(task.status)) {
    return new Date(task.resolvedAt ?? task.createdAt).getTime();
  }
  return new Date(task.createdAt).getTime();
}

/**
 * 统一任务中心里的经营任务视图规则：
 * - open / in_progress 始终保留在当前任务，因为它们仍需处理
 * - 已关闭任务按“最近关注窗口”停留在当前任务，之后再沉到历史
 */
export function isOperationTaskCurrent(task: OperationTaskView, now: Date = new Date()) {
  if (task.status === "open" || task.status === "in_progress") return true;
  return getOperationTaskAttentionTimestamp(task) >= now.getTime() - CURRENT_TASK_WINDOW_MS;
}

export function isOperationTaskHistory(task: OperationTaskView, now: Date = new Date()) {
  return !isOperationTaskCurrent(task, now);
}
