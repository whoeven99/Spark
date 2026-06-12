/**
 * 会话内 AI 任务状态的统一轮询（侧栏「本会话任务」与消息内 TaskRunChatCard 共享）。
 *
 * 由 ChatPanel 持有一份，避免同页多张卡片各自轮询同一接口。
 * 合并式更新：掉出「当前任务」视图（>24h）的任务保留最后已知状态。
 */
import { useEffect, useMemo, useState } from "react";
import type { AITaskItem } from "../../../lib/aiTaskTypes";

const POLL_INTERVAL_MS = 5000;
const ERROR_RETRY_MS = 10000;
/** ids 变化后最长轮询时长 */
const MAX_POLL_MS = 10 * 60 * 1000;
/** 新建任务可能尚未出现在列表中：该窗口内即使无 running 也继续轮询 */
const PENDING_APPEAR_MS = 60 * 1000;

export function useConversationTaskStatuses(
  taskIds: string[],
  locationSearch: string,
): { tasksById: Record<string, AITaskItem> } {
  const [tasksById, setTasksById] = useState<Record<string, AITaskItem>>({});
  const idsKey = useMemo(() => taskIds.join(","), [taskIds]);

  useEffect(() => {
    if (!idsKey) {
      setTasksById({});
      return;
    }
    const idSet = new Set(idsKey.split(","));
    const seenIds = new Set<string>();
    let cancelled = false;
    let timer: number | undefined;
    const startedAt = Date.now();

    const poll = async () => {
      try {
        const params = new URLSearchParams(
          locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch,
        );
        params.set("view", "current");
        params.set("pageSize", "50");
        const res = await fetch(`/api/ai-task?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { tasks?: AITaskItem[] };
        if (cancelled) return;
        const matched = (data.tasks ?? []).filter((task) => idSet.has(task.id));
        for (const task of matched) seenIds.add(task.id);
        if (matched.length > 0) {
          setTasksById((current) => {
            const next = { ...current };
            for (const task of matched) next[task.id] = task;
            return next;
          });
        }
        const anyRunning = matched.some((task) => task.status === "running");
        const elapsed = Date.now() - startedAt;
        const awaitingAppear = seenIds.size < idSet.size && elapsed < PENDING_APPEAR_MS;
        if ((!anyRunning && !awaitingAppear) || elapsed > MAX_POLL_MS) return;
        timer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
      } catch {
        if (cancelled) return;
        if (Date.now() - startedAt <= MAX_POLL_MS) {
          timer = window.setTimeout(() => void poll(), ERROR_RETRY_MS);
        }
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [idsKey, locationSearch]);

  return { tasksById };
}
