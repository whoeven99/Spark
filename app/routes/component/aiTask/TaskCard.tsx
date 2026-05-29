import { useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { TaskStatusBadge } from "./TaskStatusBadge";
import { LogViewer } from "./LogViewer";
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

export function TaskCard({ task, locationSearch, onDelete, deleting }: Props) {
  const { t } = useTranslation();
  const [localStatus, setLocalStatus] = useState<AITaskStatus>(task.status);
  const [localResult, setLocalResult] = useState<Record<string, unknown> | null>(
    task.result,
  );

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
          <img
            src={imageUrl}
            alt=""
            style={{
              width: 52,
              height: 52,
              objectFit: "cover",
              borderRadius: 8,
              flexShrink: 0,
            }}
          />
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

      {localStatus === "running" && (
        <LogViewer
          taskId={task.id}
          locationSearch={locationSearch}
          initialLogs={[]}
          onStatusChange={handleStatusChange}
        />
      )}

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
