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
  BulkInventoryImportTaskConfig,
} from "../../../lib/aiTaskTypes";
import { BulkInventoryImportReviewDialog } from "./BulkInventoryImportReviewDialog";
import { readBulkInventoryImportResult } from "./BulkInventoryImportTaskDetailPage";

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

export function BulkInventoryImportTaskCard({
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

  const config = task.config as Partial<BulkInventoryImportTaskConfig>;
  const result = readBulkInventoryImportResult(task);
  const summary = result?.summary ?? null;
  const unknown = t("common.unknown");

  const metaLine = (
    <>
      <span>
        {t("bulkInventoryImport.metaLocation", {
          name: result?.locationName ?? config.locationName ?? unknown,
        })}
      </span>
      <span style={{ color: pageColorTokens.textFootnote }}>|</span>
      <span>
        {t("bulkInventoryImport.metaFile", {
          name: result?.fileName ?? config.fileName ?? unknown,
        })}
      </span>
      <span style={{ color: pageColorTokens.textFootnote }}>|</span>
      <span>
        {t("bulkInventoryImport.metaQuantityColumn", {
          column: config.quantityColumn ?? unknown,
        })}
      </span>
      {summary ? (
        <>
          <span style={{ color: pageColorTokens.textFootnote }}>|</span>
          <span>
            {t("bulkInventoryImport.metaMatched", {
              matched: summary.matched,
              total: summary.sheetRows,
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
        return t("bulkInventoryImport.cardPrimaryRunning");
      case "pending_review":
        return summary
          ? t("bulkInventoryImport.cardPrimaryPendingReview", {
              changed: summary.changed,
              issues: summary.issues,
            })
          : t("bulkInventoryImport.cardPrimaryRunning");
      case "applied":
        return t("bulkInventoryImport.cardPrimaryApplied", {
          succeeded: applyOutcome?.succeeded ?? 0,
          failed: applyOutcome?.failed ?? 0,
        });
      case "failed":
        return t("bulkInventoryImport.cardPrimaryFailed", {
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
        return t("bulkInventoryImport.cardPrimaryCancelled");
      default:
        return t("bulkInventoryImport.cardPrimaryRunning");
    }
  })();

  const secondaryCopy =
    localStatus === "pending_review"
      ? t("bulkInventoryImport.cardSecondaryPendingReview")
      : localStatus === "applied"
        ? t("bulkInventoryImport.cardSecondaryApplied")
        : t("bulkInventoryImport.cardSecondaryDefault");

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
              ? t("bulkInventoryImport.actionViewApplied")
              : t("bulkInventoryImport.actionReview"),
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
        title={t("bulkInventoryImport.cardTitle")}
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
        <BulkInventoryImportReviewDialog
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
