import { listRecentAITasksForShop } from "../aiTask/aiTaskStore.server";
import type { AITaskItem } from "../../lib/aiTaskTypes";
import type { UnifiedTaskEntry } from "../../lib/unifiedTaskTypes";

const DEFAULT_MERGE_POOL_SIZE = 200;

function entryUpdatedAt(entry: Extract<UnifiedTaskEntry, { entryType: "ai_task" }>): string {
  return entry.task.updatedAt;
}

/** 合并 AI 任务，按最近更新时间排序（整店翻译已迁移至 TSF，不再合并 V4 任务）。 */
export async function listMergedUnifiedTaskEntries(
  shop: string,
  options?: { limit?: number; poolSize?: number },
): Promise<UnifiedTaskEntry[]> {
  const poolSize = options?.poolSize ?? DEFAULT_MERGE_POOL_SIZE;
  const limit = options?.limit ?? poolSize;

  const aiTasks = await listRecentAITasksForShop(shop, poolSize);

  const aiEntries: UnifiedTaskEntry[] = aiTasks.map((task: AITaskItem) => ({
    entryType: "ai_task",
    task,
  }));

  return aiEntries
    .sort(
      (a, b) =>
        new Date(entryUpdatedAt(b)).getTime() - new Date(entryUpdatedAt(a)).getTime(),
    )
    .slice(0, limit);
}
