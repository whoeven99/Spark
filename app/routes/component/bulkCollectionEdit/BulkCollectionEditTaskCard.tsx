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
  BulkCollectionEditTaskConfig,
} from "../../../lib/aiTaskTypes";
import { BulkCollectionEditReviewDialog } from "./BulkCollectionEditReviewDialog";
import { readBulkCollectionEditResult } from "./BulkCollectionEditTaskDetailPage";

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

export function BulkCollectionEditTaskCard({
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

  const config = task.config as Partial<BulkCollectionEditTaskConfig>;
  const result = readBulkCollectionEditResult(task);
  const summary = result?.summary ?? null;
  const unknown = t("common.unknown");

  // 合集名称只有试算读过 Shopify 之后才有权威值；在那之前不猜，显示占位
  const collectionTitle = result?.collectionTitle || unknown;
  const actionLabel = config.action
    ? t(`bulkCollectionEdit.ruleAction.${config.action}`)
    : unknown;

  const metaLine = (
    <>
      <span>{t("bulkCollectionEdit.metaRule", { action: actionLabel })}</span>
      <span style={{ color: pageColorTokens.textFootnote }}>|</span>
      <span>{t("bulkCollectionEdit.metaCollection", { collection: collectionTitle })}</span>
      <span style={{ color: pageColorTokens.textFootnote }}>|</span>
      <span>
        {t("bulkCollectionEdit.metaProducts", { count: config.totalProducts ?? unknown })}
      </span>
    </>
  );

  const applyOutcome = result?.apply ?? null;
  const primaryCopy = (() => {
    switch (localStatus) {
      case "running":
        return t("bulkCollectionEdit.cardPrimaryRunning");
      case "pending_review":
        return summary
          ? t("bulkCollectionEdit.cardPrimaryPendingReview", {
              changed: summary.changed,
              skipped: summary.skipped,
            })
          : t("bulkCollectionEdit.cardPrimaryRunning");
      case "applied":
        return t("bulkCollectionEdit.cardPrimaryApplied", {
          succeeded: applyOutcome?.succeeded ?? 0,
          failed: applyOutcome?.failed ?? 0,
        });
      case "failed":
        return t("bulkCollectionEdit.cardPrimaryFailed", {
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
        return t("bulkCollectionEdit.cardPrimaryCancelled");
      default:
        return t("bulkCollectionEdit.cardPrimaryRunning");
    }
  })();

  const secondaryCopy =
    localStatus === "pending_review"
      ? t("bulkCollectionEdit.cardSecondaryPendingReview")
      : localStatus === "applied"
        ? applyOutcome?.pendingJob
          ? t("bulkCollectionEdit.cardSecondaryPendingJob")
          : t("bulkCollectionEdit.cardSecondaryApplied")
        : t("bulkCollectionEdit.cardSecondaryDefault");

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
              ? t("bulkCollectionEdit.actionViewApplied")
              : t("bulkCollectionEdit.actionReview"),
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
        title={t("bulkCollectionEdit.cardTitle")}
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
        <BulkCollectionEditReviewDialog
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
