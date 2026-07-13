import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import {
  AITaskCardShell,
  type CardAction,
  formatActualElapsed,
} from "../aiTask/AITaskCardShell";
import { elapsedSecondsSince } from "../aiTask/LogViewer";
import type {
  AdsCatalogSyncTaskResult,
  AITaskItem,
  AITaskStatus,
} from "../../../lib/aiTaskTypes";

type Props = {
  task: AITaskItem;
  locationSearch: string;
  onDelete: () => void;
  onOpenDetail: () => void;
  onOpenReview?: () => void;
  onTaskUpdated?: (
    taskId: string,
    status: AITaskStatus,
    result?: Record<string, unknown>,
  ) => void;
  deleting: boolean;
};

function readPlatform(task: AITaskItem): "facebook" | "google" {
  const platform = (task.config as Record<string, unknown>)?.platform;
  return platform === "google" ? "google" : "facebook";
}

function readTotal(task: AITaskItem): number | null {
  const total = (task.config as Record<string, unknown>)?.totalProducts;
  return typeof total === "number" ? total : null;
}

function readResult(task: AITaskItem): AdsCatalogSyncTaskResult | null {
  if (!task.result) return null;
  const r = task.result as Record<string, unknown>;
  if (typeof r.platform !== "string") return null;
  return r as unknown as AdsCatalogSyncTaskResult;
}

function getEffectiveStatus(task: AITaskItem, localStatus: AITaskStatus): AITaskStatus {
  if (localStatus !== "succeeded") return localStatus;
  const result = readResult(task);
  if (result && result.succeeded === 0 && result.failed > 0) return "failed";
  return localStatus;
}

function getProgressPercent(task: AITaskItem, status: AITaskStatus): number {
  switch (status) {
    case "running":
      return 55;
    case "succeeded":
      return 100;
    case "failed":
      return 60;
    case "cancelled":
      return 30;
    default:
      return 18;
  }
}

function getProgressBackground(status: AITaskStatus): string {
  switch (status) {
    case "running":
      return "linear-gradient(90deg, #4070f4 0%, #6f8df9 55%, #a3b8fb 100%)";
    case "succeeded":
      return "linear-gradient(90deg, #00a67c 0%, #00a67c 100%)";
    case "failed":
      return "linear-gradient(90deg, #d97706 0%, #f59e0b 100%)";
    default:
      return "linear-gradient(90deg, #9ca3af 0%, #cbd5e1 100%)";
  }
}

export function AdsCatalogTaskCard({
  task,
  locationSearch,
  onDelete,
  onOpenDetail,
  onOpenReview,
  onTaskUpdated,
  deleting,
}: Props) {
  const { t, i18n } = useTranslation();
  const [localStatus, setLocalStatus] = useState<AITaskStatus>(task.status);

  useEffect(() => {
    setLocalStatus(task.status);
  }, [task.status]);

  const platform = readPlatform(task);
  const total = readTotal(task);
  const result = readResult(task);
  const effectiveStatus = getEffectiveStatus(task, localStatus);
  const platformLabel = t(
    platform === "facebook" ? "adsCatalog.platformFacebook" : "adsCatalog.platformGoogle",
  );

  const primaryCopy = useMemo(() => {
    if (effectiveStatus === "running") {
      return t("adsCatalog.statusRunningCopy", { platform: platformLabel });
    }
    if (effectiveStatus === "succeeded") {
      return t("adsCatalog.statusSucceededCopy", {
        succeeded: result?.succeeded ?? 0,
        failed: result?.failed ?? 0,
      });
    }
    if (effectiveStatus === "failed") {
      return task.errorMsg || t("adsCatalog.statusFailedCopy");
    }
    return t("adsCatalog.statusUnknownCopy");
  }, [effectiveStatus, platformLabel, result, t, task.errorMsg]);

  const secondaryCopy = useMemo(() => {
    if (effectiveStatus === "running") {
      const seconds = elapsedSecondsSince(task.startedAt);
      return seconds > 0
        ? t("adsCatalog.elapsedRunning", { seconds })
        : t("adsCatalog.elapsedJustStarted");
    }
    const formatted = formatActualElapsed(task.startedAt, task.completedAt);
    return formatted
      ? t("adsCatalog.elapsedCompleted", { duration: formatted })
      : t("adsCatalog.elapsedNoTimer");
  }, [effectiveStatus, t, task.startedAt, task.completedAt]);

  const actions: CardAction[] = useMemo(() => {
    if (effectiveStatus === "running") {
      return [
        {
          label: t("adsCatalog.actionStopDisabled"),
          tone: "primary",
          disabled: true,
        },
        {
          label: deleting ? t("common.deleting") : t("common.delete"),
          tone: "subtle",
          onClick: onDelete,
          disabled: deleting,
        },
      ];
    }
    const base: CardAction[] = [
      { label: t("common.viewDetail"), tone: "primary", onClick: onOpenDetail },
    ];
    if ((result?.gmcReview || result?.metaReview) && onOpenReview) {
      base.push({
        label: t("adsCatalog.reviewViewDetail"),
        tone: "secondary",
        onClick: onOpenReview,
      });
    }
    base.push({
      label: deleting ? t("common.deleting") : t("common.delete"),
      tone: "subtle",
      onClick: onDelete,
      disabled: deleting,
    });
    return base;
  }, [deleting, effectiveStatus, onDelete, onOpenDetail, onOpenReview, result, t]);

  const reviewBadge = useMemo(() => {
    const review = result?.gmcReview ?? result?.metaReview;
    if (!review) return null;
    if (review.disapproved > 0) {
      return (
        <span style={{ color: "#c0392b", fontSize: 12, fontWeight: 600 }}>
          {t("adsCatalog.reviewBadge", { count: review.disapproved })}
        </span>
      );
    }
    if (review.pending > 0) {
      return (
        <span style={{ color: "#a36a00", fontSize: 12 }}>
          {t("adsCatalog.reviewPendingBadge", { count: review.pending })}
        </span>
      );
    }
    return (
      <span style={{ color: "#0f7a52", fontSize: 12 }}>
        {t("adsCatalog.reviewApprovedBadge", { count: review.approved })}
      </span>
    );
  }, [result, t]);

  return (
    <AITaskCardShell
      task={task}
      locationSearch={locationSearch}
      status={effectiveStatus}
      title={
        <span style={{ fontWeight: 700, color: pageColorTokens.textPrimary }}>
          {t("adsCatalog.taskTitle", { platform: platformLabel })}
        </span>
      }
      metaLine={
        <span style={{ color: pageColorTokens.textSecondary, fontSize: 12 }}>
          {total != null
            ? t("adsCatalog.metaProductCount", { count: total })
            : t("adsCatalog.metaAllProducts")}
          {" · "}
          {new Intl.DateTimeFormat(i18n.language).format(new Date(task.createdAt))}
        </span>
      }
      extraBadges={reviewBadge}
      primaryCopy={primaryCopy}
      secondaryCopy={secondaryCopy}
      progressPercent={getProgressPercent(task, effectiveStatus)}
      progressBackground={getProgressBackground(effectiveStatus)}
      actions={actions}
      showLogViewer={effectiveStatus === "running"}
      onStatusChange={(status, nextResult) => {
        setLocalStatus(status);
        onTaskUpdated?.(task.id, status, nextResult);
      }}
    />
  );
}
