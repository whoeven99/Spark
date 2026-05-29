import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { TaskStatusBadge } from "./TaskStatusBadge";
import { elapsedSecondsSince, LogViewer } from "./LogViewer";
import type { AITaskItem, AITaskStatus } from "../../../lib/aiTaskTypes";

type Props = {
  task: AITaskItem;
  locationSearch: string;
  onDelete: (taskId: string) => void;
  deleting: boolean;
};

function getConfigSummary(task: AITaskItem): string {
  const cfg = task.config;
  if (task.taskType === "image_generation") {
    return (cfg.description as string | undefined) || (cfg.prompt as string) || "";
  }
  if (task.taskType === "picture_translate") {
    return `${cfg.sourceCode ?? "auto"} → ${cfg.targetCode ?? ""}`;
  }
  return "";
}

function getTaskTypeLabel(task: AITaskItem): string {
  if (task.taskType === "image_generation") return "图片生成";
  if (task.taskType === "picture_translate") return "图片翻译";
  return "任务";
}

function getEstimatedTimeLabel(task: AITaskItem): string {
  if (task.taskType === "image_generation") return "约 1–2 分钟";
  if (task.taskType === "picture_translate") return "约 1–3 分钟";
  return "";
}

function formatActualElapsed(startedAt: string | null, completedAt: string | null): string | null {
  if (!startedAt || !completedAt) return null;
  const elapsedMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const s = Math.floor(elapsedMs / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m > 0) return `${m}m ${rem}s`;
  return `${s}s`;
}

function formatRunningElapsed(startedAt: string | null): string | null {
  const seconds = elapsedSecondsSince(startedAt);
  if (seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function TaskCard({ task, locationSearch, onDelete, deleting }: Props) {
  const { t } = useTranslation();
  const [localStatus, setLocalStatus] = useState<AITaskStatus>(task.status);
  const [localResult, setLocalResult] = useState<Record<string, unknown> | null>(
    task.result,
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [runningElapsed, setRunningElapsed] = useState<string | null>(() =>
    task.status === "running" ? formatRunningElapsed(task.startedAt) : null,
  );

  useEffect(() => {
    if (localStatus !== "running") {
      setRunningElapsed(null);
      return;
    }
    const tick = () => setRunningElapsed(formatRunningElapsed(task.startedAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [localStatus, task.startedAt]);

  const imageUrl =
    (localResult?.imageUrl as string | undefined) ??
    (task.result?.imageUrl as string | undefined);

  const summary = getConfigSummary(task);
  const shortId = task.id.slice(0, 8).toUpperCase();
  const typeLabel = getTaskTypeLabel(task);
  const estimatedTime = getEstimatedTimeLabel(task);
  const actualElapsed = formatActualElapsed(task.startedAt, task.completedAt);

  function handleStatusChange(
    status: AITaskStatus,
    result?: Record<string, unknown>,
  ) {
    setLocalStatus(status);
    if (result) setLocalResult(result);
  }

  return (
    <div
      style={{
        border: `1px solid ${pageColorTokens.border}`,
        borderRadius: pageColorTokens.radiusCard,
        padding: "14px 16px",
        background: pageColorTokens.surface,
        boxShadow: pageColorTokens.shadowCard,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        {imageUrl ? (
          <button
            type="button"
            onClick={() => {
              if (localStatus === "succeeded") setPreviewOpen((open) => !open);
            }}
            disabled={localStatus !== "succeeded"}
            style={{
              border: "none",
              padding: 0,
              background: "none",
              cursor: localStatus === "succeeded" ? "pointer" : "default",
              flexShrink: 0,
            }}
            aria-label={t("visualHistory.viewLarge")}
          >
            <img
              src={imageUrl}
              alt={t("imageGeneration.generatedImageAlt")}
              style={{
                width: 52,
                height: 52,
                objectFit: "cover",
                borderRadius: 8,
                display: "block",
              }}
            />
          </button>
        ) : (
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 8,
              background: pageColorTokens.surfaceMuted,
              flexShrink: 0,
            }}
          />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title row: id + status badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 2,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: pageColorTokens.textPrimary,
              }}
            >
              #{shortId}
            </span>
            <TaskStatusBadge status={localStatus} />
          </div>

          {/* Meta line: task type · estimated time · credits */}
          <div
            style={{
              fontSize: 12,
              color: pageColorTokens.textSecondary,
              marginBottom: 4,
              display: "flex",
              gap: 4,
              flexWrap: "wrap",
            }}
          >
            <span>{typeLabel}</span>
            {localStatus === "running" && estimatedTime && (
              <>
                <span style={{ color: pageColorTokens.textFootnote }}>·</span>
                <span>预估 {estimatedTime}</span>
              </>
            )}
            {localStatus === "running" && runningElapsed && (
              <>
                <span style={{ color: pageColorTokens.textFootnote }}>·</span>
                <span>已执行 {runningElapsed}</span>
              </>
            )}
            {localStatus !== "running" && actualElapsed && (
              <>
                <span style={{ color: pageColorTokens.textFootnote }}>·</span>
                <span>实际耗时 {actualElapsed}</span>
              </>
            )}
            {(task.actualCredits ?? task.estimatedCredits) != null && (
              <>
                <span style={{ color: pageColorTokens.textFootnote }}>·</span>
                <span>
                  {task.actualCredits != null
                    ? `实际 ${task.actualCredits} credits`
                    : `预估 ${task.estimatedCredits} credits`}
                </span>
              </>
            )}
          </div>

          {/* Description */}
          <div
            style={{
              fontSize: 13,
              color: pageColorTokens.textBody,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {summary}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
          {imageUrl && localStatus === "succeeded" && (
            <s-button
              variant="tertiary"
              onClick={() => setPreviewOpen((open) => !open)}
            >
              {previewOpen ? t("visualHistory.collapse") : t("visualHistory.view")}
            </s-button>
          )}
          <s-button
            variant="tertiary"
            tone="critical"
            disabled={deleting}
            onClick={() => onDelete(task.id)}
            accessibilityLabel={t("visualHistory.delete")}
          >
            {deleting ? t("visualHistory.deleting") : t("visualHistory.delete")}
          </s-button>
        </div>
      </div>

      {previewOpen && imageUrl && localStatus === "succeeded" && (
        <div
          style={{
            border: `1px solid ${pageColorTokens.border}`,
            borderRadius: 10,
            padding: 12,
            background: pageColorTokens.surfaceMuted,
          }}
        >
          <img
            src={imageUrl}
            alt={t("imageGeneration.generatedImageAlt")}
            style={{
              width: "100%",
              maxHeight: 480,
              objectFit: "contain",
              borderRadius: 8,
              display: "block",
            }}
          />
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <s-button
              variant="secondary"
              onClick={() => {
                window.open(imageUrl, "_blank", "noopener,noreferrer");
              }}
            >
              {t("imageGeneration.openImage")}
            </s-button>
          </div>
        </div>
      )}

      <LogViewer
        taskId={task.id}
        taskType={task.taskType}
        status={localStatus}
        locationSearch={locationSearch}
        startedAt={task.startedAt}
        initialLogs={[]}
        defaultLogsOpen={localStatus === "running"}
        onStatusChange={handleStatusChange}
      />

      {localStatus === "failed" && task.errorMsg && (
        <div
          style={{
            fontSize: 12,
            color: pageColorTokens.criticalText,
            background: pageColorTokens.criticalBg,
            padding: "8px 10px",
            borderRadius: 8,
          }}
        >
          {task.errorMsg}
        </div>
      )}
    </div>
  );
}
