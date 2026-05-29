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

// Estimated duration in seconds used only to compute progress bar fill
const ESTIMATED_SECONDS = 90;

type PlaybookStep = {
  label: string;
  match: string[];
};

const PLAYBOOKS: Record<AITaskType, PlaybookStep[]> = {
  image_generation: [
    {
      label: "正在等待执行任务",
      match: ["正在等待执行任务", "图片生成任务开始", "任务开始"],
    },
    {
      label: "正在润色提示词生成更好的图片",
      match: ["正在润色提示词生成更好的图片", "正在将文字润色", "文字已优化", "已读取图片描述词"],
    },
    {
      label: "正在大模型生成图片中",
      match: ["正在大模型生成图片中", "大模型正在生成图片", "图片已生成"],
    },
  ],
  picture_translate: [
    {
      label: "正在等待执行任务",
      match: ["正在等待执行任务", "整图翻译任务开始", "任务开始"],
    },
    {
      label: "正在解析图片与语言配置",
      match: ["正在解析图片与语言配置", "正在调用翻译 API"],
    },
    {
      label: "正在调用大模型翻译图片",
      match: ["正在调用大模型翻译图片", "翻译完成"],
    },
  ],
  product_improve: [
    {
      label: "正在等待执行任务",
      match: ["正在等待执行任务", "任务开始"],
    },
    {
      label: "已读取商品的标题、描述和其他信息",
      match: ["已读取商品的标题、描述和其他信息", "已读取商品标题"],
    },
    {
      label: "开始提炼转化卖点，并对原文进行压缩",
      match: ["开始提炼转化卖点，并对原文进行压缩", "开始提炼高转化卖点"],
    },
    {
      label: "正在生成新的标题草稿，保证关键词自然出现",
      match: ["正在生成新的标题草稿", "正在生成高转化商品文案"],
    },
    {
      label: "正在补充描述段落，准备输出结果摘要",
      match: ["正在补充描述段落", "文案已生成"],
    },
  ],
};

const FINISHED_STATUSES: AITaskStatus[] = [
  "succeeded",
  "pending_review",
  "applied",
  "scored",
];

function buildStreamUrl(taskId: string, locationSearch: string): string {
  const params = new URLSearchParams(
    locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch,
  );
  params.set("taskId", taskId);
  return `/api/ai-task-stream?${params.toString()}`;
}

function formatLogTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("zh-CN", { hour12: false });
}

function resolveActiveStepIndex(
  steps: PlaybookStep[],
  logs: AITaskLogEntry[],
): number {
  let active = 0;
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    if (logs.some((log) => step.match.some((m) => log.message.includes(m)))) {
      active = i;
    }
  }
  return active;
}

export function LogViewer({
  taskId,
  taskType,
  status,
  locationSearch,
  initialLogs = [],
  startedAt,
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
  const steps = PLAYBOOKS[taskType] ?? PLAYBOOKS.image_generation;
  const isDone = currentStatus !== "running";
  const shouldConnect = currentStatus === "running" || logsOpen;
  const activeStepIndex = FINISHED_STATUSES.includes(currentStatus)
    ? steps.length
    : resolveActiveStepIndex(steps, logs);

  useEffect(() => {
    startMsRef.current = resolveStartMs(startedAt);
    setElapsed(Math.floor((Date.now() - startMsRef.current) / 1000));
  }, [startedAt]);

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
              background: isDone
                ? pageColorTokens.brandGreen
                : `linear-gradient(90deg, ${pageColorTokens.brandGreen}, ${pageColorTokens.brandBlue})`,
              transition: isDone ? "width 0.4s ease" : "width 1s linear",
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {steps.map((step, index) => {
          const complete = FINISHED_STATUSES.includes(currentStatus) || index < activeStepIndex;
          const active = currentStatus === "running" && index === activeStepIndex;
          const failed = currentStatus === "failed" && index === activeStepIndex;
          const dotColor = failed
            ? pageColorTokens.critical
            : complete
              ? pageColorTokens.brandGreen
              : active
                ? pageColorTokens.brandBlue
                : pageColorTokens.textFootnote;
          return (
            <div key={step.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                  color: complete || active || failed
                    ? pageColorTokens.textBody
                    : pageColorTokens.textSecondary,
                  fontWeight: active ? 600 : 400,
                }}
              >
                {step.label}
              </span>
            </div>
          );
        })}
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
            {elapsed > 0 ? `任务执行中，已运行 ${formatElapsedClock(elapsed)}` : "等待执行中..."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {logs.map((log) => (
              <div
                key={log.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "48px 76px minmax(0, 1fr)",
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
                  {formatLogTime(log.createdAt)}
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
