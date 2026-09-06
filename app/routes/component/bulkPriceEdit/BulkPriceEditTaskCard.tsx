import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { getTaskStatusTone } from "../aiTask/taskStatusTone";
import { AITaskCardShell, type CardAction } from "../aiTask/AITaskCardShell";
import { safeTranslateAITaskMessage } from "../../../lib/aiTaskMessage";
import { shouldRetainLocalAiTaskStatus } from "../../../lib/aiTaskStatusSync";
import type {
  AITaskItem,
  AITaskStatus,
  BulkPriceEditTaskConfig,
} from "../../../lib/aiTaskTypes";
import { BulkPriceEditReviewDialog } from "./BulkPriceEditReviewDialog";
import { readBulkPriceEditResult } from "./BulkPriceEditTaskDetailPage";

type Props = {
  task: AITaskItem;
  locationSearch: string;
  onDelete: () => void;
  onTaskUpdated?: (
    taskId: string,
    status: AITaskStatus,
    result?: Record<string, unknown>,
  ) => void;
  deleting: boolean;
};

function progressPercentFor(status: AITaskStatus): number {
  switch (status) {
    case "running":
      return 45;
    case "pending_review":
    case "applied":
    case "succeeded":
    case "scored":
      return 100;
    case "failed":
      return 56;
    case "cancelled":
      return 24;
    default:
      return 0;
  }
}

export function BulkPriceEditTaskCard({
  task,
  locationSearch,
  onDelete,
  onTaskUpdated,
  deleting,
}: Props) {
  const { t } = useTranslation();
  const [localStatus, setLocalStatus] = useState<AITaskStatus>(task.status);
  const [reviewOpen, setReviewOpen] = useState(false);

  useEffect(() => {
    // 已在本地写回过的任务不能被迟到的 pending_review 快照打回
    if (shouldRetainLocalAiTaskStatus(localStatus, task.status)) return;
    setLocalStatus(task.status);
  }, [localStatus, task.status]);

  const config = task.config as Partial<BulkPriceEditTaskConfig>;
  const result = readBulkPriceEditResult(task);
  const summary = result?.summary ?? null;
  const unknown = t("common.unknown");

  const ruleLabel = config.priceMode
    ? t(`workspace.taskProposal.paramValues.priceMode.${config.priceMode}`, {
        defaultValue: config.priceMode,
      })
    : unknown;
  const valueLabel =
    config.priceMode && config.priceMode !== "unchanged" && config.priceValue != null
      ? config.priceMode.startsWith("percent")
        ? `${config.priceValue}%`
        : String(config.priceValue)
      : "";

  const metaLine = (
    <>
      <span>{t("bulkPriceEdit.metaRule", { rule: `${ruleLabel}${valueLabel ? ` ${valueLabel}` : ""}` })}</span>
      <span style={{ color: pageColorTokens.textFootnote }}>|</span>
      <span>
        {t("bulkPriceEdit.metaProducts", { count: config.totalProducts ?? unknown })}
      </span>
      {summary ? (
        <>
          <span style={{ color: pageColorTokens.textFootnote }}>|</span>
          <span>{t("bulkPriceEdit.metaVariants", { count: summary.variants })}</span>
        </>
      ) : null}
      {config.minPrice != null ? (
        <>
          <span style={{ color: pageColorTokens.textFootnote }}>|</span>
          <span>{t("bulkPriceEdit.metaMinPrice", { value: config.minPrice })}</span>
        </>
      ) : null}
    </>
  );

  const applyOutcome = result?.apply ?? null;
  const primaryCopy = (() => {
    switch (localStatus) {
      case "running":
        return t("bulkPriceEdit.cardPrimaryRunning");
      case "pending_review":
        return summary
          ? t("bulkPriceEdit.cardPrimaryPendingReview", {
              changed: summary.changed,
              skipped: summary.skipped,
            })
          : t("bulkPriceEdit.cardPrimaryRunning");
      case "applied":
        return t("bulkPriceEdit.cardPrimaryApplied", {
          succeeded: applyOutcome?.succeeded ?? 0,
          failed: applyOutcome?.failed ?? 0,
        });
      case "failed":
        return t("bulkPriceEdit.cardPrimaryFailed", {
          reason: task.errorMsgKey
            ? safeTranslateAITaskMessage({
                t,
                message: task.errorMsg ?? unknown,
                messageKey: task.errorMsgKey,
                messageParams: task.errorMsgParams,
              })
            : (task.errorMsg ?? unknown),
        });
      case "cancelled":
        return t("bulkPriceEdit.cardPrimaryCancelled");
      default:
        return t("bulkPriceEdit.cardPrimaryRunning");
    }
  })();

  const secondaryCopy =
    localStatus === "pending_review"
      ? t("bulkPriceEdit.cardSecondaryPendingReview")
      : localStatus === "applied"
        ? t("bulkPriceEdit.cardSecondaryApplied")
        : t("bulkPriceEdit.cardSecondaryDefault");

  const deleteAction: CardAction = {
    label: deleting ? t("common.deleting") : t("common.delete"),
    tone: "subtle",
    onClick: onDelete,
    disabled: deleting,
  };

  const actions: CardAction[] = result
    ? [
        {
          label:
            localStatus === "applied"
              ? t("bulkPriceEdit.actionViewApplied")
              : t("bulkPriceEdit.actionReview"),
          tone: "primary",
          onClick: () => setReviewOpen(true),
        },
        deleteAction,
      ]
    : [deleteAction];

  return (
    <>
      <AITaskCardShell
        task={task}
        locationSearch={locationSearch}
        status={localStatus}
        title={t("bulkPriceEdit.cardTitle")}
        metaLine={metaLine}
        primaryCopy={primaryCopy}
        primaryCopyColor={
          localStatus === "failed" ? pageColorTokens.criticalText : pageColorTokens.textPrimary
        }
        secondaryCopy={secondaryCopy}
        progressPercent={progressPercentFor(localStatus)}
        progressBackground={getTaskStatusTone(localStatus).accent}
        actions={actions}
        showLogViewer={localStatus === "running"}
        onStatusChange={(status, nextResult) => {
          setLocalStatus(status);
          onTaskUpdated?.(task.id, status, nextResult);
        }}
      />
      {result ? (
        <BulkPriceEditReviewDialog
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          task={task}
          onTaskUpdated={(taskId, status, nextResult) => {
            setLocalStatus(status);
            onTaskUpdated?.(taskId, status, nextResult);
          }}
        />
      ) : null}
    </>
  );
}
