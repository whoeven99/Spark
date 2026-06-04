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
  onDelete: (taskId: string) => void;
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

function getProgressPercent(status: AITaskStatus): number {
  switch (status) {
    case "running":
      return 58;
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
  const viewLabel =
    status === "failed" ? t("imageStudio.viewFailureDetail") : t("imageStudio.viewResult");
  return [
    {
      label: viewLabel,
      tone: status === "running" ? "secondary" : "primary",
      onClick: onOpenDetail,
    },
    {
      label: deleting ? t("visualHistory.deleting") : t("visualHistory.delete"),
      tone: "subtle",
      onClick: onDelete,
      disabled: deleting,
    },
  ];
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
  const provider = readStringField(result, "provider");
  const sourceType = getSourceLabel(readStringField(config, "sourceType"), (key) => t(key));
  const actualElapsed = formatActualElapsed(task.startedAt, task.completedAt);
  const elapsedLabel = runningElapsed ?? actualElapsed ?? t("common.unknown");

  const primaryCopy =
    localStatus === "running"
      ? t("imageStudio.pictureTranslateRunning")
      : localStatus === "failed"
        ? t("imageStudio.pictureTranslateFailed")
        : t("imageStudio.pictureTranslateReady");

  const secondaryCopy =
    provider != null
      ? t("imageStudio.imageTaskSecondaryWithProvider", {
          elapsed: elapsedLabel,
          provider,
        })
      : t("imageStudio.imageTaskSecondary", { elapsed: elapsedLabel });

  const actions = getActions({
    status: localStatus,
    onOpenDetail,
    onDelete: () => onDelete(task.id),
    deleting,
    t: (key) => t(key),
  });

  return (
    <AITaskCardShell
      task={task}
      locationSearch={locationSearch}
      status={localStatus}
      title={t("imageStudio.taskGoalTranslate")}
      metaLine={
        <>
          <span>{t("imageStudio.taskLanguageDirection", { source: sourceCode, target: targetCode })}</span>
          {sourceType ? (
            <>
              <span style={{ color: pageColorTokens.textFootnote }}>|</span>
              <span>{sourceType}</span>
            </>
          ) : null}
          {provider ? (
            <>
              <span style={{ color: pageColorTokens.textFootnote }}>|</span>
              <span>{provider}</span>
            </>
          ) : null}
        </>
      }
      primaryCopy={primaryCopy}
      secondaryCopy={secondaryCopy}
      progressPercent={getProgressPercent(localStatus)}
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
