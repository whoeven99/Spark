import type { OperationTaskView } from "../server/operations/dailyInspection.server";
import { isOperationTaskCurrent, isOperationTaskHistory } from "./operationTaskList";

export function computeUnifiedTaskTabCounts(params: {
  aiCurrentCount: number;
  aiHistoryCount: number;
  operationTasks: OperationTaskView[];
  scheduledAutomationCount: number;
  operationSourceFilter?: string[];
  now?: Date;
}): { currentCount: number; historyCount: number } {
  const now = params.now ?? new Date();
  const operationSourceFilter = params.operationSourceFilter ?? [];

  if (operationSourceFilter.length > 0) {
    return {
      currentCount: params.operationTasks.filter(
        (task) =>
          isOperationTaskCurrent(task, now) &&
          operationSourceFilter.includes(task.sourceKey),
      ).length,
      historyCount: params.operationTasks.filter(
        (task) =>
          isOperationTaskHistory(task, now) &&
          operationSourceFilter.includes(task.sourceKey),
      ).length,
    };
  }

  return {
    currentCount:
      params.aiCurrentCount +
      params.operationTasks.filter((task) => isOperationTaskCurrent(task, now)).length +
      params.scheduledAutomationCount,
    historyCount:
      params.aiHistoryCount +
      params.operationTasks.filter((task) => isOperationTaskHistory(task, now)).length,
  };
}
