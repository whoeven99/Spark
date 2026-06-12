import { listRecentAITasksForShop } from "../aiTask/aiTaskStore.server";
import { listV4Jobs } from "../translation/v4/cosmosV4Store.server";
import {
  TERMINAL_V4_STATUSES,
  type TranslationV4Job,
} from "../translation/v4/types";
import type { AITaskItem } from "../../lib/aiTaskTypes";
import type { UnifiedTaskEntry } from "../../lib/unifiedTaskTypes";

const DEFAULT_MERGE_POOL_SIZE = 200;

function entryUpdatedAt(entry: UnifiedTaskEntry): string {
  return entry.entryType === "ai_task" ? entry.task.updatedAt : entry.job.updatedAt;
}

/** 合并 AI 任务与翻译 V4 任务，按最近更新时间排序。 */
export async function listMergedUnifiedTaskEntries(
  shop: string,
  options?: { limit?: number; poolSize?: number },
): Promise<UnifiedTaskEntry[]> {
  const poolSize = options?.poolSize ?? DEFAULT_MERGE_POOL_SIZE;
  const limit = options?.limit ?? poolSize;

  const [aiTasks, v4Jobs] = await Promise.all([
    listRecentAITasksForShop(shop, poolSize),
    listV4Jobs(shop).catch(() => [] as TranslationV4Job[]),
  ]);

  const aiEntries: UnifiedTaskEntry[] = aiTasks.map((task: AITaskItem) => ({
    entryType: "ai_task",
    task,
  }));
  const v4Entries: UnifiedTaskEntry[] = v4Jobs.map((job) => ({
    entryType: "translation_v4",
    job,
  }));

  return [...aiEntries, ...v4Entries]
    .sort(
      (a, b) =>
        new Date(entryUpdatedAt(b)).getTime() - new Date(entryUpdatedAt(a)).getTime(),
    )
    .slice(0, limit);
}

export function isCurrentV4Job(job: TranslationV4Job): boolean {
  return !TERMINAL_V4_STATUSES.includes(job.status) && job.status !== "PAUSED";
}
