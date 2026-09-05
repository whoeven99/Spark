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
  BulkStatusEditTaskConfig,
} from "../../../lib/aiTaskTypes";
import { BulkStatusEditReviewDialog } from "./BulkStatusEditReviewDialog";
import { readBulkStatusEditResult } from "./BulkStatusEditTaskDetailPage";

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

export function BulkStatusEditTaskCard({
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

  const config = task.config as Partial<BulkStatusEditTaskConfig>;
  const result = readBulkStatusEditResult(task);
  const summary = result?.summary ?? null;
  const unknown = t("common.unknown");

  // 规则摘要：改成什么状态、有没有库存前置条件
  const ruleParts: string[] = [];
  if (config.targetStatus) {
    ruleParts.push(t(`bulkStatusEdit.ruleTarget.${config.targetStatus}`));
  }
  if (config.inventoryCondition && config.inventoryCondition !== "none") {
    ruleParts.push(t(`bulkStatusEdit.ruleInventory.${config.inventoryCondition}`));
  }
  const ruleLabel = ruleParts.join(" · ") || unknown;

  const metaLine = (
    <>
      <span>{t("bulkStatusEdit.metaRule", { rule: ruleLabel })}</span>
      <span style={{ color: pageColorTokens.textFootnote }}>|</span>
      <span>{t("bulkStatusEdit.metaProducts", { count: config.totalProducts ?? unknown })}</span>
      {summary ? (
        <>
          <span style={{ color: pageColorTokens.textFootnote }}>|</span>
          <span>
            {t("bulkStatusEdit.metaStatusOps", {
              toActive: summary.toActive,
              toDraft: summary.toDraft,
            })}
          </span>
        </>
      ) : null}
    </>
  );

  const applyOutcome = result?.apply ?? null;
  const primaryCopy = (() => {
    switch (localStatus) {
      case "running":
        return t("bulkStatusEdit.cardPrimaryRunning");
      case "pending_review":
        return summary
          ? t("bulkStatusEdit.cardPrimaryPendingReview", {
              changed: summary.changed,
              skipped: summary.skipped,
            })
          : t("bulkStatusEdit.cardPrimaryRunning");
      case "applied":
        return t("bulkStatusEdit.cardPrimaryApplied", {
          succeeded: applyOutcome?.succeeded ?? 0,
          failed: applyOutcome?.failed ?? 0,
        });
      case "failed":
        return t("bulkStatusEdit.cardPrimaryFailed", {
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
        return t("bulkStatusEdit.cardPrimaryCancelled");
      default:
        return t("bulkStatusEdit.cardPrimaryRunning");
    }
  })();

  const secondaryCopy =
    localStatus === "pending_review"
      ? t("bulkStatusEdit.cardSecondaryPendingReview")
      : localStatus === "applied"
        ? t("bulkStatusEdit.cardSecondaryApplied")
        : t("bulkStatusEdit.cardSecondaryDefault");

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
              ? t("bulkStatusEdit.actionViewApplied")
              : t("bulkStatusEdit.actionReview"),
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
        title={t("bulkStatusEdit.cardTitle")}
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
        <BulkStatusEditReviewDialog
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
