import { useEffect, useRef, useState } from "react";
import { pageColorTokens } from "../../page/pageUiStyles";
import type { AITaskLogEntry, AITaskSSEEvent, AITaskStatus } from "../../../lib/aiTaskTypes";

type Props = {
  taskId: string;
  locationSearch: string;
  initialLogs?: AITaskLogEntry[];
  /** 任务实际开始时间；用于刷新页面后恢复已执行时长与进度条 */
  startedAt?: string | null;
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

// Estimated duration in seconds used only to compute progress bar fill
const ESTIMATED_SECONDS = 90;

export function LogViewer({
  taskId,
  locationSearch,
  initialLogs = [],
  startedAt,
  onStatusChange,
}: Props) {
  const startMsRef = useRef(resolveStartMs(startedAt));
  const [logs, setLogs] = useState<AITaskLogEntry[]>(initialLogs);
  const [done, setDone] = useState(false);
  const [elapsed, setElapsed] = useState(() =>
    Math.floor((Date.now() - startMsRef.current) / 1000),
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    startMsRef.current = resolveStartMs(startedAt);
    setElapsed(Math.floor((Date.now() - startMsRef.current) / 1000));
  }, [startedAt]);

  useEffect(() => {
    if (done) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startMsRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [done]);

  useEffect(() => {
    const url = `/api/ai-task-stream?taskId=${encodeURIComponent(taskId)}${locationSearch}`;
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
          setDone(true);
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
  }, [taskId, locationSearch, onStatusChange]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const progressPct = done
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
              color: done ? pageColorTokens.brandGreenDark : pageColorTokens.brandBlue,
            }}
          >
            {done ? "已完成" : "运行中"}
          </span>
          <span
            style={{
              fontSize: 12,
              fontVariantNumeric: "tabular-nums",
              color: pageColorTokens.textSecondary,
              letterSpacing: "0.02em",
            }}
          >
            {formatElapsedClock(elapsed)}
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
              background: done
                ? pageColorTokens.brandGreen
                : `linear-gradient(90deg, ${pageColorTokens.brandGreen}, ${pageColorTokens.brandBlue})`,
              transition: done ? "width 0.4s ease" : "width 1s linear",
            }}
          />
        </div>
      </div>

      {/* Step log */}
      {logs.length === 0 ? (
        <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
          {elapsed > 0 ? `任务执行中，已运行 ${formatElapsedClock(elapsed)}` : "等待执行中..."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {logs.map((log) => (
            <div
              key={log.id}
              style={{
                display: "flex",
                gap: 10,
                fontSize: 12,
                lineHeight: 1.6,
                color: pageColorTokens.textBody,
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  color: pageColorTokens.textSecondary,
                  fontVariantNumeric: "tabular-nums",
                  width: 38,
                  fontSize: 11,
                }}
              >
                {formatElapsedClock(log.elapsedSeconds)}
              </span>
              <span>{log.message}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
