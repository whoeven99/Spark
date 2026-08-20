import { listRecentAITasksForShop } from "../aiTask/aiTaskStore.server";
import type { AITaskItem } from "../../lib/aiTaskTypes";
import type { UnifiedTaskEntry } from "../../lib/unifiedTaskTypes";
import { listOperationTasks } from "../operations/dailyInspection.server";

const DEFAULT_MERGE_POOL_SIZE = 200;

function entryUpdatedAt(entry: UnifiedTaskEntry): string {
  if (entry.entryType === "ai_task") return entry.task.updatedAt;
  return entry.task.resolvedAt ?? entry.task.createdAt;
}

/** 合并 AI 任务与经营任务，按最近更新时间排序。 */
export async function listMergedUnifiedTaskEntries(
  shop: string,
  options?: { limit?: number; poolSize?: number },
): Promise<UnifiedTaskEntry[]> {
  const poolSize = options?.poolSize ?? DEFAULT_MERGE_POOL_SIZE;
  const limit = options?.limit ?? poolSize;

  const [aiTasks, operationTasks] = await Promise.all([
    listRecentAITasksForShop(shop, poolSize),
    listOperationTasks(shop),
  ]);

  const aiEntries: UnifiedTaskEntry[] = aiTasks.map((task: AITaskItem) => ({
    entryType: "ai_task",
    task,
  }));
  const operationEntries: UnifiedTaskEntry[] = operationTasks.map((task) => ({
    entryType: "operation_task",
    task,
  }));

  return [...aiEntries, ...operationEntries]
    .sort(
      (a, b) =>
        new Date(entryUpdatedAt(b)).getTime() - new Date(entryUpdatedAt(a)).getTime(),
    )
    .slice(0, limit);
}
