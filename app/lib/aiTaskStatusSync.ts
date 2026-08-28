import type { AITaskItem, AITaskStatus } from "./aiTaskTypes";

/** 任务状态接口 GET 禁止浏览器缓存，避免 apply 后读到旧的 pending_review。 */
export const AI_TASK_FETCH_INIT: RequestInit = { cache: "no-store" };

export const AI_TASK_NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

/**
 * 会话侧栏 / 任务卡在这些状态下继续轮询。
 * pending_review / scored 不是终态：用户可能在详情页点「应用」，轮询停掉就会一直显示待审核。
 */
export function shouldKeepPollingAiTaskStatus(status: AITaskStatus): boolean {
  return status === "running" || status === "pending_review" || status === "scored";
}

/** 本地已应用后，迟到或缓存的 pending_review 快照不能把状态打回去。 */
export function shouldRetainLocalAiTaskStatus(
  localStatus: AITaskStatus,
  incomingStatus: AITaskStatus,
): boolean {
  return localStatus === "applied" && incomingStatus === "pending_review";
}

export function mergeFetchedAiTask(local: AITaskItem, incoming: AITaskItem): AITaskItem {
  if (shouldRetainLocalAiTaskStatus(local.status, incoming.status)) {
    return local;
  }
  return incoming;
}
