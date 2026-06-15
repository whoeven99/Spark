import type { AITaskItem, AITaskType } from "./aiTaskTypes";

export function buildOptimisticAiTask(params: {
  taskId: string;
  batchId: string;
  taskType: AITaskType;
  optimisticConfig?: Record<string, unknown>;
}): AITaskItem {
  const now = new Date().toISOString();
  return {
    id: params.taskId,
    batchId: params.batchId,
    shop: "",
    taskType: params.taskType,
    status: "running",
    config: params.optimisticConfig ?? {},
    result: null,
    estimatedCredits: null,
    actualCredits: null,
    startedAt: now,
    completedAt: null,
    errorMsg: null,
    createdAt: now,
    updatedAt: now,
  };
}
