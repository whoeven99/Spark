import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { elapsedSecondsSince } from "../aiTask/LogViewer";
import {
  AITaskCardShell,
  type CardAction,
  formatActualElapsed,
} from "../aiTask/AITaskCardShell";
import type { AITaskItem, AITaskStatus } from "../../../lib/aiTaskTypes";

type Props = {
  task: AITaskItem;
  locationSearch: string;
  onDelete: () => void;
  onOpenDetail: () => void;
  onTaskUpdated?: (taskId: string, status: AITaskStatus, result?: Record<string, unknown>) => void;
  deleting: boolean;
};

function readStringField(
  source: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatRunningElapsed(startedAt: string | null): string | null {
  const seconds = elapsedSecondsSince(startedAt);
  if (seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
}

function getProgressPercent(status: AITaskStatus, hasRunningElapsed: boolean): number {
  switch (status) {
    case "running":
      return hasRunningElapsed ? 58 : 18;
    case "succeeded":
    case "applied":
    case "pending_review":
    case "scored":
      return 100;
    case "failed":
      return 54;
    case "cancelled":
      return 24;
    default:
      return 0;
  }
}

function getProgressBackground(status: AITaskStatus): string {
  switch (status) {
    case "running":
      return "linear-gradient(90deg, #d97706 0%, #f59e0b 100%)";
    case "succeeded":
    case "applied":
    case "pending_review":
    case "scored":
      return "linear-gradient(90deg, #00a67c 0%, #34caa1 100%)";
    case "failed":
      return "linear-gradient(90deg, #dc2626 0%, #ef4444 100%)";
    default:
      return "linear-gradient(90deg, #9ca3af 0%, #cbd5e1 100%)";
  }
}

function getActions(params: {
  status: AITaskStatus;
  onOpenDetail: () => void;
  onDelete: () => void;
  deleting: boolean;
  t: (key: string) => string;
}): CardAction[] {
  const { status, onOpenDetail, onDelete, deleting, t } = params;
  switch (status) {
    case "running":
      return [
        { label: t("imageStudio.actionViewTask"), tone: "secondary", onClick: onOpenDetail },
        {
          label: deleting ? t("visualHistory.deleting") : t("visualHistory.delete"),
          tone: "subtle",
          onClick: onDelete,
          disabled: deleting,
        },
      ];
    case "failed":
      return [
        { label: t("imageStudio.actionOptimizeAgain"), tone: "primary", onClick: onOpenDetail },
        { label: t("imageStudio.viewFailureDetail"), tone: "secondary", onClick: onOpenDetail },
        {
          label: deleting ? t("visualHistory.deleting") : t("visualHistory.delete"),
          tone: "subtle",
          onClick: onDelete,
          disabled: deleting,
        },
      ];
    default:
      return [
        { label: t("imageStudio.actionReviewResult"), tone: "primary", onClick: onOpenDetail },
        {
          label: deleting ? t("visualHistory.deleting") : t("visualHistory.delete"),
          tone: "subtle",
          onClick: onDelete,
          disabled: deleting,
        },
      ];
  }
}

function getSourceLabel(sourceType: string | null, t: (key: string) => string): string | null {
  if (sourceType === "upload") return t("imageStudio.taskSourceUpload");
  if (sourceType === "product") return t("imageStudio.taskSourceProduct");
  if (sourceType === "url") return t("imageStudio.taskSourceUrl");
  return null;
}

export function PictureTranslateTaskCard({
  task,
  locationSearch,
  onDelete,
  onOpenDetail,
  onTaskUpdated,
  deleting,
}: Props) {
  const { t } = useTranslation();
  const [localStatus, setLocalStatus] = useState<AITaskStatus>(task.status);
  const [runningElapsed, setRunningElapsed] = useState<string | null>(null);

  useEffect(() => {
    setLocalStatus(task.status);
  }, [task.status]);

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

  const config = task.config as Record<string, unknown>;
  const result = task.result as Record<string, unknown> | null;
  const sourceCode = readStringField(config, "sourceCode") ?? "auto";
  const targetCode = readStringField(config, "targetCode") ?? "-";
  const provider =
    readStringField(result, "provider") ??
    (config.modelType === 2 ? "volc" : config.modelType === 1 ? "aidge" : null);
  const sourceType = getSourceLabel(readStringField(config, "sourceType"), (key) => t(key));
  const actualElapsed = formatActualElapsed(task.startedAt, task.completedAt);
  const elapsedLabel = runningElapsed ?? actualElapsed;
  const errorReason = task.errorMsg;

  const primaryCopy =
    localStatus === "running"
      ? t("imageStudio.cardPrimaryTranslating")
      : localStatus === "failed"
        ? t("imageStudio.cardPrimaryTranslateFailed", { errorReason: errorReason ?? "" })
        : t("imageStudio.cardPrimaryTranslateReady");

  const secondaryCopy = (() => {
    if (localStatus === "running") {
      const parts: string[] = [];
      if (elapsedLabel) parts.push(t("imageStudio.cardPartElapsed", { value: elapsedLabel }));
      if (task.estimatedCredits != null) parts.push(t("imageStudio.cardPartEstimatedCredits", { value: task.estimatedCredits }));
      return parts.join(" | ");
    }
    if (localStatus === "failed") {
      const parts: string[] = [t("imageStudio.cardPartFailed")];
      if (task.actualCredits != null) parts.push(t("imageStudio.cardPartUsedCredits", { value: task.actualCredits }));
      if (task.estimatedCredits != null) parts.push(t("imageStudio.cardPartEstimatedCredits", { value: task.estimatedCredits }));
      return parts.join(" | ");
    }
    const parts: string[] = [];
    if (elapsedLabel) parts.push(t("imageStudio.cardPartCompletedElapsed", { value: elapsedLabel }));
    if (task.actualCredits != null) parts.push(t("imageStudio.cardPartActualCredits", { value: task.actualCredits }));
    return parts.join(" | ");
  })();

  const extraBadges = sourceType ? (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: pageColorTokens.textSecondary,
        padding: "0.22rem 0.48rem",
        borderRadius: 999,
        background: pageColorTokens.surfaceSubtle,
        border: `1px solid ${pageColorTokens.borderSubtle}`,
      }}
    >
      {sourceType}
    </span>
  ) : null;

  const actions = getActions({
    status: localStatus,
    onOpenDetail,
    onDelete,
    deleting,
    t: (key) => t(key),
  });

  return (
    <AITaskCardShell
      task={task}
      locationSearch={locationSearch}
      status={localStatus}
      title={t("imageStudio.taskGoalTitle", { value: t("imageStudio.taskGoalTranslateShort") })}
      metaLine={
        <>
          <span>{t("imageStudio.taskDetailLabel")}</span>
          <span>{t("imageStudio.taskLanguageDirection", { source: sourceCode, target: targetCode })}</span>
          {provider != null && (
            <>
              <span style={{ color: pageColorTokens.textFootnote }}>|</span>
              <span>{t("imageStudio.detailProvider", { value: provider })}</span>
            </>
          )}
          {task.estimatedCredits != null && (
            <>
              <span style={{ color: pageColorTokens.textFootnote }}>|</span>
              <span>{t("imageStudio.estimatedCreditsValue", { value: task.estimatedCredits })}</span>
            </>
          )}
        </>
      }
      extraBadges={extraBadges}
      primaryCopy={primaryCopy}
      secondaryCopy={secondaryCopy}
      progressPercent={getProgressPercent(localStatus, Boolean(runningElapsed))}
      progressBackground={getProgressBackground(localStatus)}
      actions={actions}
      showLogViewer={localStatus === "running"}
      onStatusChange={(status, nextResult) => {
        setLocalStatus(status);
        onTaskUpdated?.(task.id, status, nextResult);
      }}
    />
  );
}
