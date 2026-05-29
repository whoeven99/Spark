import { useEffect, useRef, useState } from "react";
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

function buildStreamUrl(taskId: string, locationSearch: string): string {
  const params = new URLSearchParams(
    locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch,
  );
  params.set("taskId", taskId);
  return `/api/ai-task-stream?${params.toString()}`;
}

function dedupeConsecutiveLogs(logs: AITaskLogEntry[]): AITaskLogEntry[] {
  return logs.filter((log, index) => index === 0 || log.message !== logs[index - 1].message);
}

function stepDurationSeconds(logs: AITaskLogEntry[], index: number): number {
  if (index <= 0) return logs[index]?.elapsedSeconds ?? 0;
  return Math.max(0, logs[index].elapsedSeconds - logs[index - 1].elapsedSeconds);
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
  const [logs, setLogs] = useState<AITaskLogEntry[]>(initialLogs);
  const [currentStatus, setCurrentStatus] = useState<AITaskStatus>(status);
  const [logsOpen, setLogsOpen] = useState(defaultLogsOpen ?? status === "running");
  const [elapsed, setElapsed] = useState(() =>
    Math.floor((Date.now() - startMsRef.current) / 1000),
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const isDone = currentStatus !== "running";
  const shouldConnect = currentStatus === "running" || logsOpen || logs.length === 0;
  const workflowLogs = dedupeConsecutiveLogs(logs);
  const completedElapsed = Math.max(
    logs.reduce((max, log) => Math.max(max, log.elapsedSeconds), 0),
    elapsedSecondsBetween(startedAt, completedAt),
  );
  const displayElapsed = isDone && completedElapsed > 0 ? completedElapsed : elapsed;

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

  useEffect(() => {
    if (!shouldConnect) return;
    const url = buildStreamUrl(taskId, locationSearch);
    const source = new EventSource(url);

    source.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data as string) as AITaskSSEEvent;
        if (event.type === "connected") {
          setLogs(event.existingLogs);
        } else if (event.type === "log") {
          setLogs((prev) => [
            ...prev,
            {
              id: `${event.taskId}-${event.createdAt}`,
              taskId: event.taskId,
              elapsedSeconds: event.elapsedSeconds,
              message: event.message,
              createdAt: event.createdAt,
            },
          ]);
        } else if (event.type === "status_change") {
          setCurrentStatus(event.status);
          onStatusChange?.(event.status, event.result);
          source.close();
        }
      } catch {
        // ignore parse errors
      }
    };

    source.onerror = () => {
      source.close();
    };

    return () => {
      source.close();
    };
  }, [taskId, locationSearch, onStatusChange, shouldConnect]);

  useEffect(() => {
    if (logsOpen) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, logsOpen]);

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
            {isDone ? "流程记录" : "Playbook 执行中"}
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

      {logsOpen && (
        logs.length === 0 ? (
          <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
            {isDone && completedElapsed > 0
              ? `任务已结束，实际耗时 ${formatElapsedClock(completedElapsed)}`
              : elapsed > 0
                ? `任务执行中，已运行 ${formatElapsedClock(elapsed)}`
                : "等待执行中..."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {logs.map((log, index) => (
              <div
                key={log.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "48px 56px minmax(0, 1fr)",
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
                  +{formatElapsedClock(stepDurationSeconds(logs, index))}
                </span>
                <span>{log.message}</span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )
      )}
    </div>
  );
}
