import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { elapsedSecondsSince } from "../aiTask/LogViewer";
import {
  AITaskCardShell,
  type CardAction,
} from "../aiTask/AITaskCardShell";
import type {
  AITaskItem,
  AITaskStatus,
  ProductImproveTaskConfig,
} from "../../../lib/aiTaskTypes";
import { safeTranslateAITaskMessage } from "../../../lib/aiTaskMessage";
import { translateLegacyProductImproveTaskMessage } from "../../../lib/productImproveTaskMessage";

type Props = {
  task: AITaskItem;
  locationSearch: string;
  onDelete: (taskId: string) => void;
  onOpenDetail: () => void;
  onTaskUpdated?: (taskId: string, status: AITaskStatus, result?: Record<string, unknown>) => void;
  deleting: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatElapsedFromSeconds(seconds: number, locale: string): string | null {
  if (seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  const minuteText = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "minute",
    unitDisplay: "short",
  }).format(minutes);
  const secondText = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "second",
    unitDisplay: "short",
  }).format(remainingSeconds);
  return minutes > 0 ? `${minuteText} ${secondText}` : secondText;
}

function formatRunningElapsed(startedAt: string | null, locale: string): string | null {
  const seconds = elapsedSecondsSince(startedAt);
  return formatElapsedFromSeconds(seconds, locale);
}

function readStringField(
  source: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumberField(
  source: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  const value = source?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatDisplayValue(
  value: string | number | null | undefined,
  fallback: string,
): string {
  if (value == null || value === "") return fallback;
  return String(value);
}

function inferCreditInsufficient(task: AITaskItem): boolean {
  const haystack = `${task.errorMsg ?? ""} ${JSON.stringify(task.result ?? {})}`.toLowerCase();
  return haystack.includes("credit") || haystack.includes("积分") || haystack.includes("额度");
}

function getProgressPercent(
  task: AITaskItem,
  status: AITaskStatus,
  runningElapsed: string | null,
): number {
  const config = task.config as Record<string, unknown>;
  const result = task.result as Record<string, unknown> | null;
  const explicit =
    readNumberField(result, "progressPercent") ??
    readNumberField(config, "progressPercent");

  if (explicit != null) return Math.max(0, Math.min(100, explicit));

  switch (status) {
    case "running":
      return runningElapsed ? 62 : 18;
    case "pending_review":
    case "succeeded":
    case "scored":
    case "applied":
      return 100;
    case "failed":
      return 56;
    case "cancelled":
      return 24;
    default:
      return 0;
  }
}

function getProgressTone(status: AITaskStatus) {
  switch (status) {
    case "running":
      return {
        background: "linear-gradient(90deg, #00a67c 0%, #35b486 55%, #7ad9a8 100%)",
        text: pageColorTokens.textPrimary,
      };
    case "pending_review":
    case "succeeded":
    case "scored":
    case "applied":
      return {
        background: "linear-gradient(90deg, #00a67c 0%, #00a67c 100%)",
        text: pageColorTokens.textPrimary,
      };
    case "failed":
      return {
        background: "linear-gradient(90deg, #d97706 0%, #f59e0b 100%)",
        text: pageColorTokens.criticalText,
      };
    default:
      return {
        background: "linear-gradient(90deg, #9ca3af 0%, #cbd5e1 100%)",
        text: pageColorTokens.textPrimary,
      };
  }
}

function resolveCardActions(params: {
  status: AITaskStatus;
  creditInsufficient: boolean;
  onOpenDetail: () => void;
  onDelete: () => void;
  deleting: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
}): CardAction[] {
  const { status, creditInsufficient, onOpenDetail, onDelete, deleting, t } = params;

  if (creditInsufficient) {
    return [
      { label: t("productImproveStage1.actionRechargeCredits"), tone: "primary", disabled: true },
      { label: t("productImproveStage1.actionResumeTask"), tone: "secondary", disabled: true },
      {
        label: deleting ? t("common.deleting") : t("common.viewDetail"),
        tone: "subtle",
        onClick: onOpenDetail,
        disabled: deleting,
      },
    ];
  }

  switch (status) {
    case "running":
      return [
        { label: t("productImproveStage1.actionStopTask"), tone: "primary", disabled: true },
        {
          label: deleting ? t("common.deleting") : t("common.delete"),
          tone: "subtle",
          onClick: onDelete,
          disabled: deleting,
        },
      ];
    case "pending_review":
    case "succeeded":
      return [
        { label: t("productImproveStage1.actionReviewResult"), tone: "primary", onClick: onOpenDetail },
        {
          label: deleting ? t("common.deleting") : t("common.delete"),
          tone: "subtle",
          onClick: onDelete,
          disabled: deleting,
        },
      ];
    case "scored":
      return [
        { label: t("productImproveStage1.actionViewAppliedResult"), tone: "primary", onClick: onOpenDetail },
        {
          label: deleting ? t("common.deleting") : t("common.delete"),
          tone: "subtle",
          onClick: onDelete,
          disabled: deleting,
        },
      ];
    case "applied":
      return [
        { label: t("productImproveStage1.actionViewAppliedResult"), tone: "primary", onClick: onOpenDetail },
        {
          label: deleting ? t("common.deleting") : t("common.delete"),
          tone: "subtle",
          onClick: onDelete,
          disabled: deleting,
        },
      ];
    case "failed":
      return [
        { label: t("productImproveStage1.actionRerunTask"), tone: "primary", disabled: true },
        { label: t("productImproveStage1.actionViewFailureDetail"), tone: "secondary", onClick: onOpenDetail },
        {
          label: deleting ? t("common.deleting") : t("common.delete"),
          tone: "subtle",
          onClick: onDelete,
          disabled: deleting,
        },
      ];
    case "cancelled":
      return [
        { label: t("productImproveStage1.actionRecreateTask"), tone: "primary", disabled: true },
        { label: t("common.viewDetail"), tone: "secondary", onClick: onOpenDetail },
        {
          label: deleting ? t("common.deleting") : t("common.delete"),
          tone: "subtle",
          onClick: onDelete,
          disabled: deleting,
        },
      ];
    default:
      return [
        { label: t("common.viewDetail"), tone: "secondary", onClick: onOpenDetail },
        {
          label: deleting ? t("common.deleting") : t("common.delete"),
          tone: "subtle",
          onClick: onDelete,
          disabled: deleting,
        },
      ];
  }
}

function getPrimaryStatusCopy(params: {
  status: AITaskStatus;
  creditInsufficient: boolean;
  progressPercent: string;
  currentStepText: string;
  errorReason: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}): string {
  const { status, creditInsufficient, progressPercent, currentStepText, errorReason, t } = params;

  if (creditInsufficient) {
    return t("productImproveStage1.cardPrimaryCreditInsufficient", { progressPercent });
  }

  switch (status) {
    case "running":
      return currentStepText && !currentStepText.startsWith("{{")
        ? currentStepText
        : t("productImproveStage1.cardPrimaryRunning");
    case "pending_review":
      return t("productImproveStage1.cardPrimaryPendingReview");
    case "succeeded":
      return t("productImproveStage1.cardPrimarySucceeded");
    case "scored":
      return t("productImproveStage1.cardPrimaryScored");
    case "applied":
      return t("productImproveStage1.cardPrimaryApplied");
    case "failed":
      return t("productImproveStage1.cardPrimaryFailed", { errorReason });
    case "cancelled":
      return t("productImproveStage1.cardPrimaryCancelled");
    default:
      return t("productImproveStage1.cardPrimaryUpdated", { progressPercent });
  }
}

function getSecondaryStatusCopy(params: {
  status: AITaskStatus;
  creditInsufficient: boolean;
  elapsedLabel: string;
  usedCredits: string;
  estimatedCredits: string;
  completedCount: string;
  itemCount: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}): string {
  const { status, creditInsufficient, elapsedLabel, usedCredits, estimatedCredits, completedCount, itemCount, t } =
    params;

  if (creditInsufficient) {
    return t("productImproveStage1.cardSecondaryCreditInsufficient", {
      elapsedLabel,
      usedCredits,
      estimatedCredits,
    });
  }

  switch (status) {
    case "running":
      return t("productImproveStage1.cardSecondaryRunning", { elapsedLabel });
    case "pending_review":
    case "succeeded":
    case "scored":
    case "applied":
      return t("productImproveStage1.cardSecondaryCompleted", { elapsedLabel, usedCredits });
    case "failed":
      return t("productImproveStage1.cardSecondaryFailed", { completedCount, itemCount });
    case "cancelled":
      return t("productImproveStage1.cardSecondaryCancelled", { completedCount, itemCount });
    default:
      return t("productImproveStage1.cardSecondaryDefault", { estimatedCredits, usedCredits });
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProductImproveTaskCard({
  task,
  locationSearch,
  onDelete,
  onOpenDetail,
  onTaskUpdated,
  deleting,
}: Props) {
  const { t, i18n } = useTranslation();
  const unknownText = t("common.unknown");
  const [localStatus, setLocalStatus] = useState<AITaskStatus>(task.status);
  const cfg = task.config as Partial<ProductImproveTaskConfig>;
  const extendedConfig = task.config as Record<string, unknown>;
  const extendedResult = task.result as Record<string, unknown> | null;

  const [runningElapsed, setRunningElapsed] = useState<string | null>(null);

  useEffect(() => {
    setLocalStatus(task.status);
  }, [task.status]);

  useEffect(() => {
    if (localStatus !== "running") {
      setRunningElapsed(null);
      return;
    }
    const tick = () => setRunningElapsed(formatRunningElapsed(task.startedAt, i18n.language));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [i18n.language, localStatus, task.startedAt]);

  const creditInsufficient = inferCreditInsufficient(task);

  // ── Computed display values ──
  const taskGoal = readStringField(extendedConfig, "taskGoal") ?? t("productImproveStage1.defaultTaskGoal");
  const itemCount = formatDisplayValue(readNumberField(extendedConfig, "itemCount"), unknownText);
  const completedCount = formatDisplayValue(
    readNumberField(extendedResult, "completedCount") ??
      readNumberField(extendedConfig, "completedCount"),
    unknownText,
  );
  const progressPercent = getProgressPercent(task, localStatus, runningElapsed);
  const progressPercentValue =
    readNumberField(extendedResult, "progressPercent") ??
    readNumberField(extendedConfig, "progressPercent");
  const progressPercentText = formatDisplayValue(progressPercentValue ?? progressPercent, unknownText);
  const sourceLanguage = formatDisplayValue(
    readStringField(extendedConfig, "sourceLanguage"),
    unknownText,
  );
  const targetLanguage = formatDisplayValue(cfg.targetLanguage, unknownText);
  const brandStyle = formatDisplayValue(
    readStringField(extendedConfig, "brandStyle"),
    unknownText,
  );
  const currentStepTextRaw =
    readStringField(extendedResult, "currentStepText") ??
    readStringField(extendedConfig, "currentStepText");
  const currentStepText = currentStepTextRaw
    ? translateLegacyProductImproveTaskMessage(currentStepTextRaw, t)
    : null;
  const usedCredits = formatDisplayValue(task.actualCredits, unknownText);
  const estimatedCredits = formatDisplayValue(task.estimatedCredits, unknownText);
  const errorReason = task.errorMsgKey
    ? safeTranslateAITaskMessage({
        t,
        message: task.errorMsg ?? unknownText,
        messageKey: task.errorMsgKey,
        messageParams: task.errorMsgParams,
      })
    : task.errorMsg
      ? translateLegacyProductImproveTaskMessage(task.errorMsg, t)
      : unknownText;
  const actualElapsed =
    task.startedAt && task.completedAt
      ? formatElapsedFromSeconds(
          Math.max(
            0,
            Math.floor(
              (new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime()) / 1000,
            ),
          ),
          i18n.language,
        )
      : null;
  const elapsedLabel = runningElapsed ?? actualElapsed ?? unknownText;
  const progressTone = getProgressTone(localStatus);
  const primaryCopy = getPrimaryStatusCopy({
    status: localStatus,
    creditInsufficient,
    progressPercent: progressPercentText,
    currentStepText: currentStepText ?? "",
    errorReason,
    t,
  });
  const secondaryCopy = getSecondaryStatusCopy({
    status: localStatus,
    creditInsufficient,
    elapsedLabel,
    usedCredits,
    estimatedCredits,
    completedCount,
    itemCount,
    t,
  });
  const actions = resolveCardActions({
    status: localStatus,
    creditInsufficient,
    onOpenDetail,
    onDelete: () => onDelete(task.id),
    deleting,
    t,
  });

  // ── Meta line ──
  const metaLine = (
    <>
      <span>{t("productImproveStage1.taskDetailLabel")}</span>
      <span>{t("productImproveStage1.itemCountValue", { count: itemCount })}</span>
      <span style={{ color: pageColorTokens.textFootnote }}>|</span>
      <span>{t("productImproveStage1.outputLanguageValue", { value: targetLanguage })}</span>
      <span style={{ color: pageColorTokens.textFootnote }}>|</span>
      <span>{t("productImproveStage1.sourceLanguageValue", { value: sourceLanguage })}</span>
      <span style={{ color: pageColorTokens.textFootnote }}>|</span>
      <span>{t("productImproveStage1.brandStyleValue", { value: brandStyle })}</span>
      {cfg.productId ? (
        <>
          <span style={{ color: pageColorTokens.textFootnote }}>|</span>
          <span>{t("productImproveStage1.productIdValue", { value: cfg.productId })}</span>
        </>
      ) : null}
      {cfg.originalTitle ? (
        <>
          <span style={{ color: pageColorTokens.textFootnote }}>|</span>
          <span
            style={{
              maxWidth: 320,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              verticalAlign: "bottom",
            }}
            title={cfg.originalTitle}
          >
            {t("productImproveStage1.productValue", { value: cfg.originalTitle })}
          </span>
        </>
      ) : null}
    </>
  );

  // ── "积分不足" extra badge ──
  const extraBadges = creditInsufficient ? (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: "#9a3412",
        padding: "0.22rem 0.48rem",
        borderRadius: 999,
        background: "#fff7ed",
        border: "1px solid rgba(234, 88, 12, 0.16)",
      }}
    >
      {t("productImproveStage1.creditInsufficientBadge")}
    </span>
  ) : null;

  return (
    <AITaskCardShell
      task={task}
      locationSearch={locationSearch}
      status={localStatus}
      title={t("productImproveStage1.taskGoalTitle", { value: taskGoal })}
      metaLine={metaLine}
      extraBadges={extraBadges}
      primaryCopy={primaryCopy}
      primaryCopyColor={progressTone.text}
      secondaryCopy={secondaryCopy}
      progressPercent={progressPercent}
      progressBackground={progressTone.background}
      actions={actions}
      showLogViewer={localStatus === "running"}
      onStatusChange={(status, result) => {
        setLocalStatus(status);
        onTaskUpdated?.(task.id, status, result);
      }}
    />
  );
}
