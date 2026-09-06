import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { getTaskStatusTone } from "../aiTask/taskStatusTone";
import { AITaskCardShell, type CardAction } from "../aiTask/AITaskCardShell";
import { safeTranslateAITaskMessage } from "../../../lib/aiTaskMessage";
import { shouldRetainLocalAiTaskStatus } from "../../../lib/aiTaskStatusSync";
import type { AITaskItem, AITaskStatus, BulkTagEditTaskConfig } from "../../../lib/aiTaskTypes";
import { BulkTagEditReviewDialog } from "./BulkTagEditReviewDialog";
import { readBulkTagEditResult } from "./BulkTagEditTaskDetailPage";

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

export function BulkTagEditTaskCard({
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

  const config = task.config as Partial<BulkTagEditTaskConfig>;
  const result = readBulkTagEditResult(task);
  const summary = result?.summary ?? null;
  const unknown = t("common.unknown");

  // 规则摘要：加了什么、去了什么、清了什么前缀
  const ruleParts: string[] = [];
  if (config.addTags?.length) {
    ruleParts.push(t("bulkTagEdit.ruleAdd", { tags: config.addTags.join(", ") }));
  }
  if (config.removeTags?.length) {
    ruleParts.push(t("bulkTagEdit.ruleRemove", { tags: config.removeTags.join(", ") }));
  }
  if (config.removePrefixes?.length) {
    ruleParts.push(t("bulkTagEdit.rulePrefix", { prefixes: config.removePrefixes.join(", ") }));
  }
  const ruleLabel = ruleParts.join(" · ") || unknown;

  const metaLine = (
    <>
      <span>{t("bulkTagEdit.metaRule", { rule: ruleLabel })}</span>
      <span style={{ color: pageColorTokens.textFootnote }}>|</span>
      <span>{t("bulkTagEdit.metaProducts", { count: config.totalProducts ?? unknown })}</span>
      {summary ? (
        <>
          <span style={{ color: pageColorTokens.textFootnote }}>|</span>
          <span>
            {t("bulkTagEdit.metaTagOps", { added: summary.added, removed: summary.removed })}
          </span>
        </>
      ) : null}
    </>
  );

  const applyOutcome = result?.apply ?? null;
  const primaryCopy = (() => {
    switch (localStatus) {
      case "running":
        return t("bulkTagEdit.cardPrimaryRunning");
      case "pending_review":
        return summary
          ? t("bulkTagEdit.cardPrimaryPendingReview", {
              changed: summary.changed,
              skipped: summary.skipped,
            })
          : t("bulkTagEdit.cardPrimaryRunning");
      case "applied":
        return t("bulkTagEdit.cardPrimaryApplied", {
          succeeded: applyOutcome?.succeeded ?? 0,
          failed: applyOutcome?.failed ?? 0,
        });
      case "failed":
        return t("bulkTagEdit.cardPrimaryFailed", {
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
        return t("bulkTagEdit.cardPrimaryCancelled");
      default:
        return t("bulkTagEdit.cardPrimaryRunning");
    }
  })();

  const secondaryCopy =
    localStatus === "pending_review"
      ? t("bulkTagEdit.cardSecondaryPendingReview")
      : localStatus === "applied"
        ? t("bulkTagEdit.cardSecondaryApplied")
        : t("bulkTagEdit.cardSecondaryDefault");

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
              ? t("bulkTagEdit.actionViewApplied")
              : t("bulkTagEdit.actionReview"),
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
        title={t("bulkTagEdit.cardTitle")}
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
        <BulkTagEditReviewDialog
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
