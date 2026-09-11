import { useCallback, useEffect, useRef, useState } from "react";
import type { AITaskItem, AITaskType } from "../../../lib/aiTaskTypes";
import {
  AI_TASK_FETCH_INIT,
  shouldKeepPollingAiTaskStatus,
} from "../../../lib/aiTaskStatusSync";

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_MS = 10 * 60 * 1000;

type WatchSeed = {
  batchId?: string;
  taskType: AITaskType;
  config?: Record<string, unknown>;
};

export function useCreateAiTaskPoll(locationSearch: string) {
  const [task, setTask] = useState<AITaskItem | null>(null);
  const [pollFailed, setPollFailed] = useState(false);
  const startedAtRef = useRef<number | null>(null);

  const startWatching = useCallback((taskId: string, seed: WatchSeed) => {
    const now = new Date().toISOString();
    startedAtRef.current = Date.now();
    setPollFailed(false);
    setTask({
      id: taskId,
      batchId: seed.batchId ?? "",
      shop: "",
      taskType: seed.taskType,
      status: "running",
      config: seed.config ?? {},
      result: null,
      estimatedCredits: null,
      actualCredits: null,
      startedAt: now,
      completedAt: null,
      errorMsg: null,
      createdAt: now,
      updatedAt: now,
    });
  }, []);

  const clear = useCallback(() => {
    startedAtRef.current = null;
    setPollFailed(false);
    setTask(null);
  }, []);

  const taskId = task?.id ?? null;
  const taskStatus = task?.status ?? null;

  useEffect(() => {
    if (!taskId || !taskStatus || !shouldKeepPollingAiTaskStatus(taskStatus)) return;

    let cancelled = false;
    let timer: number | undefined;
    const params = new URLSearchParams(
      locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch,
    );

    const poll = async () => {
      try {
        const resp = await fetch(
          `/api/ai-task/${encodeURIComponent(taskId)}?${params.toString()}`,
          AI_TASK_FETCH_INIT,
        );
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const body = (await resp.json()) as { task?: AITaskItem };
        if (cancelled || !body.task) return;
        setTask(body.task);
        setPollFailed(false);
        const timedOut =
          startedAtRef.current != null &&
          Date.now() - startedAtRef.current > MAX_POLL_MS;
        if (!shouldKeepPollingAiTaskStatus(body.task.status) || timedOut) return;
        timer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
      } catch {
        if (cancelled) return;
        setPollFailed(true);
        const timedOut =
          startedAtRef.current != null &&
          Date.now() - startedAtRef.current > MAX_POLL_MS;
        if (!timedOut) {
          timer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS * 2);
        }
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [locationSearch, taskId, taskStatus]);

  return { task, pollFailed, startWatching, clear };
}
