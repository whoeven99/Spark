import { useCallback, useEffect, useRef, useState } from "react";
import { pageColorTokens } from "../../page/pageUiStyles";
import type {
  AITaskLogEntry,
  AITaskSSEEvent,
  AITaskStatus,
  AITaskType,
} from "../../../lib/aiTaskTypes";

type Props = {
  taskId: string;
  taskType: AITaskType;
  status: AITaskStatus;
  locationSearch: string;
  initialLogs?: AITaskLogEntry[];
  /** 任务实际开始时间；用于刷新页面后恢复已执行时长与进度条 */
  startedAt?: string | null;
  completedAt?: string | null;
  defaultLogsOpen?: boolean;
  onStatusChange?: (status: AITaskStatus, result?: Record<string, unknown>) => void;
};

export function elapsedSecondsSince(
  iso: string | null | undefined,
  now = Date.now(),
): number {
  if (!iso) return 0;
  const startMs = new Date(iso).getTime();
  if (Number.isNaN(startMs)) return 0;
  return Math.max(0, Math.floor((now - startMs) / 1000));
}

export function formatElapsedClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `00:${s.toString().padStart(2, "0")}`;
}

function resolveStartMs(startedAt?: string | null): number {
  if (startedAt) {
    const ms = new Date(startedAt).getTime();
    if (!Number.isNaN(ms)) return ms;
  }
  return Date.now();
}

function elapsedSecondsBetween(
  startedAt: string | null | undefined,
  completedAt: string | null | undefined,
): number {
  if (!startedAt || !completedAt) return 0;
  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(completedAt).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return 0;
  return Math.max(0, Math.floor((endMs - startMs) / 1000));
}

// Estimated duration in seconds used only to compute progress bar fill
const ESTIMATED_SECONDS = 90;
const RUNNING_POLL_MS = 2500;

function buildStreamUrl(taskId: string, locationSearch: string): string {
  const params = new URLSearchParams(
    locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch,
  );
  params.set("taskId", taskId);
  return `/api/ai-task-stream?${params.toString()}`;
}

function buildDetailUrl(taskId: string, locationSearch: string): string {
  const params = new URLSearchParams(
    locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch,
  );
  params.set("taskId", taskId);
  return `/api/ai-task-detail?${params.toString()}`;
}

function stepDurationSeconds(logs: AITaskLogEntry[], index: number): number {
  if (index <= 0) return logs[index]?.elapsedSeconds ?? 0;
  return Math.max(0, logs[index].elapsedSeconds - logs[index - 1].elapsedSeconds);
}

/** 按消息去重，保留 elapsedSeconds 更大的一条（避免 SSE 与轮询重复写入） */
function normalizeLogList(logs: AITaskLogEntry[]): AITaskLogEntry[] {
  const byMessage = new Map<string, AITaskLogEntry>();
  for (const log of logs) {
    const existing = byMessage.get(log.message);
    if (!existing || log.elapsedSeconds >= existing.elapsedSeconds) {
      byMessage.set(log.message, log);
    }
  }
  return [...byMessage.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function mergeLogEntries(
  prev: AITaskLogEntry[],
  incoming: AITaskLogEntry[],
): AITaskLogEntry[] {
  if (incoming.length === 0) return prev;
  return normalizeLogList([...prev, ...incoming]);
}

function parseSSEChunk(buffer: string): {
  events: AITaskSSEEvent[];
  rest: string;
} {
  const events: AITaskSSEEvent[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    const line = part.trim();
    if (!line.startsWith("data: ")) continue;
    try {
      events.push(JSON.parse(line.slice(6)) as AITaskSSEEvent);
    } catch {
      // ignore parse errors
    }
  }
  return { events, rest };
}

export function LogViewer({
  taskId,
  status,
  locationSearch,
  initialLogs = [],
  startedAt,
  completedAt,
  defaultLogsOpen,
  onStatusChange,
}: Props) {
  const startMsRef = useRef(resolveStartMs(startedAt));
  const onStatusChangeRef = useRef(onStatusChange);
  const [logs, setLogs] = useState<AITaskLogEntry[]>(initialLogs);
  const [currentStatus, setCurrentStatus] = useState<AITaskStatus>(status);
  const [logsOpen, setLogsOpen] = useState(defaultLogsOpen ?? status === "running");
  const [elapsed, setElapsed] = useState(() =>
    Math.floor((Date.now() - startMsRef.current) / 1000),
  );
  const logsScrollRef = useRef<HTMLDivElement>(null);
  const isDone = currentStatus !== "running";
  const displayLogs = normalizeLogList(logs);
  const workflowLogs = displayLogs;
  const completedElapsed = Math.max(
    displayLogs.reduce((max, log) => Math.max(max, log.elapsedSeconds), 0),
    elapsedSecondsBetween(startedAt, completedAt),
  );
  const displayElapsed = isDone && completedElapsed > 0 ? completedElapsed : elapsed;

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const applyStatusChange = useCallback(
    (nextStatus: AITaskStatus, result?: Record<string, unknown>) => {
      setCurrentStatus(nextStatus);
      onStatusChangeRef.current?.(nextStatus, result);
    },
    [],
  );

  const handleStreamEvent = useCallback(
    (event: AITaskSSEEvent) => {
      if (event.type === "connected") {
        setLogs(normalizeLogList(event.existingLogs));
        return;
      }
      if (event.type === "log") {
        setLogs((prev) =>
          mergeLogEntries(prev, [
            {
              id: `${event.taskId}-${event.createdAt}`,
              taskId: event.taskId,
              elapsedSeconds: event.elapsedSeconds,
              message: event.message,
              createdAt: event.createdAt,
            },
          ]),
        );
        return;
      }
      if (event.type === "status_change") {
        applyStatusChange(event.status, event.result);
      }
    },
    [applyStatusChange],
  );

  useEffect(() => {
    startMsRef.current = resolveStartMs(startedAt);
    setElapsed(
      completedAt
        ? elapsedSecondsBetween(startedAt, completedAt)
        : Math.floor((Date.now() - startMsRef.current) / 1000),
    );
  }, [completedAt, startedAt]);

  useEffect(() => {
    setCurrentStatus(status);
  }, [status]);

  useEffect(() => {
    if (isDone) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startMsRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isDone]);

  // 拉取任务快照（日志 + 状态）；运行中任务轮询兜底，避免 SSE 在嵌入式环境失效
  useEffect(() => {
    let cancelled = false;

    async function syncTaskSnapshot() {
      try {
        const resp = await fetch(buildDetailUrl(taskId, locationSearch));
        if (!resp.ok || cancelled) return;
        const body = (await resp.json()) as {
          task?: {
            status: AITaskStatus;
            result?: Record<string, unknown> | null;
          };
          logs?: AITaskLogEntry[];
        };
        if (cancelled) return;

        if (body.logs) {
          setLogs((prev) =>
            normalizeLogList(
              body.task?.status && body.task.status !== "running"
                ? body.logs!
                : [...prev, ...body.logs!],
            ),
          );
        }
        if (body.task?.status && body.task.status !== "running") {
          applyStatusChange(
            body.task.status,
            body.task.result ?? undefined,
          );
        }
      } catch {
        // ignore network errors; stream or next poll may recover
      }
    }

    void syncTaskSnapshot();

    if (currentStatus !== "running") return () => {
      cancelled = true;
    };

    const pollId = setInterval(() => {
      void syncTaskSnapshot();
    }, RUNNING_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(pollId);
    };
  }, [applyStatusChange, currentStatus, locationSearch, taskId]);

  // 运行中任务：用 fetch 读取 SSE（与聊天流一致，比 EventSource 更可靠）
  useEffect(() => {
    if (currentStatus !== "running") return;

    const abort = new AbortController();
    let buffer = "";

    async function consumeStream() {
      const resp = await fetch(buildStreamUrl(taskId, locationSearch), {
        signal: abort.signal,
      });
      if (!resp.ok || !resp.body) return;

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSSEChunk(buffer);
        buffer = parsed.rest;
        for (const event of parsed.events) {
          handleStreamEvent(event);
        }
      }
    }

    void consumeStream().catch((error: unknown) => {
      if (error instanceof Error && error.name === "AbortError") return;
    });

    return () => {
      abort.abort();
    };
  }, [currentStatus, handleStreamEvent, locationSearch, taskId]);

  useEffect(() => {
    if (!logsOpen || currentStatus !== "running") return;
    const el = logsScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logs, logsOpen, currentStatus]);

  const progressPct = isDone
    ? 100
    : Math.min((elapsed / ESTIMATED_SECONDS) * 85, 85);

  return (
    <div
      style={{
        background: pageColorTokens.surfaceMuted,
        borderRadius: 10,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Header row: status label + elapsed time + progress bar */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: isDone ? pageColorTokens.brandGreenDark : pageColorTokens.brandBlue,
            }}
          >
            {isDone ? "流程记录" : "任务执行中"}
          </span>
          <span
            style={{
              fontSize: 12,
              fontVariantNumeric: "tabular-nums",
              color: pageColorTokens.textSecondary,
              letterSpacing: "0.02em",
            }}
          >
            {formatElapsedClock(displayElapsed)}
          </span>
        </div>

        {/* Progress bar */}
        <div
          style={{
            height: 6,
            borderRadius: 3,
            background: pageColorTokens.border,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: 3,
              width: `${progressPct}%`,
              background: isDone
                ? pageColorTokens.brandGreen
                : `linear-gradient(90deg, ${pageColorTokens.brandGreen}, ${pageColorTokens.brandBlue})`,
              transition: isDone ? "width 0.4s ease" : "width 1s linear",
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {workflowLogs.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: pageColorTokens.brandBlue,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 12, lineHeight: 1.5, color: pageColorTokens.textSecondary }}>
              等待调度日志...
            </span>
          </div>
        ) : (
          workflowLogs.map((log, index) => {
            const isLatest = currentStatus === "running" && index === workflowLogs.length - 1;
            const isFailed = currentStatus === "failed" && index === workflowLogs.length - 1;
            const dotColor = isFailed
              ? pageColorTokens.critical
              : isLatest
                ? pageColorTokens.brandBlue
                : pageColorTokens.brandGreen;
            return (
              <div key={log.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: dotColor,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: pageColorTokens.textBody,
                    fontWeight: isLatest ? 600 : 400,
                  }}
                >
                  {log.message}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={() => setLogsOpen((open) => !open)}
          style={{
            border: "none",
            background: "transparent",
            color: pageColorTokens.brandBlue,
            fontSize: 12,
            fontWeight: 600,
            padding: 0,
            cursor: "pointer",
          }}
        >
          {logsOpen ? "收起日志" : "查看日志"}
        </button>
      </div>

      {        logsOpen && (
        displayLogs.length === 0 ? (
          <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
            {isDone && completedElapsed > 0
              ? `任务已结束，实际耗时 ${formatElapsedClock(completedElapsed)}`
              : elapsed > 0
                ? `任务执行中，已运行 ${formatElapsedClock(elapsed)}`
                : "等待执行中..."}
          </div>
        ) : (
          <div
            ref={logsScrollRef}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              maxHeight: 240,
              overflowY: "auto",
            }}
          >
            {displayLogs.map((log, index) => (
              <div
                key={log.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "48px 48px minmax(0, 1fr)",
                  gap: 8,
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: pageColorTokens.textBody,
                }}
              >
                <span
                  style={{
                    color: pageColorTokens.textSecondary,
                    fontVariantNumeric: "tabular-nums",
                    fontSize: 11,
                  }}
                >
                  {formatElapsedClock(log.elapsedSeconds)}
                </span>
                <span
                  style={{
                    color: pageColorTokens.textSecondary,
                    fontVariantNumeric: "tabular-nums",
                    fontSize: 11,
                  }}
                >
                  {formatElapsedClock(stepDurationSeconds(displayLogs, index))}
                </span>
                <span>{log.message}</span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
