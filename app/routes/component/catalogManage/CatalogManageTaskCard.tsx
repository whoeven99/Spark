import { useEffect, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { getTaskStatusTone } from "../aiTask/taskStatusTone";
import { AITaskCardShell, type CardAction } from "../aiTask/AITaskCardShell";
import { DialogShell } from "../shared/DialogShell";
import { safeTranslateAITaskMessage } from "../../../lib/aiTaskMessage";
import { mergeFetchedAiTask, shouldRetainLocalAiTaskStatus } from "../../../lib/aiTaskStatusSync";
import type { AITaskItem, AITaskStatus } from "../../../lib/aiTaskTypes";
import { progressPercentForCatalogTask } from "./catalogReviewUi";

type DetailProps = {
  task: AITaskItem;
  onBack: () => void;
  showBackButton?: boolean;
  onTaskUpdated?: (
    taskId: string,
    status: AITaskStatus,
    result?: Record<string, unknown>,
  ) => void;
  onBusyChange?: (busy: boolean) => void;
};

type Summary = { changed?: number; skipped?: number; exported?: number };

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
  i18nPrefix: string;
  hasResult: boolean;
  summary: Summary | null;
  ruleLabel: string;
  extraMeta?: string;
  DetailPage: ComponentType<DetailProps>;
  appliedOutcome?: { succeeded: number; failed: number } | null;
};

export function CatalogManageTaskCard({
  task,
  locationSearch,
  onDelete,
  onTaskUpdated,
  deleting,
  i18nPrefix,
  hasResult,
  summary,
  ruleLabel,
  extraMeta,
  DetailPage,
  appliedOutcome,
}: Props) {
  const { t } = useTranslation();
  const [localStatus, setLocalStatus] = useState<AITaskStatus>(task.status);
  const [localTask, setLocalTask] = useState(task);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (shouldRetainLocalAiTaskStatus(localStatus, task.status)) return;
    setLocalStatus(task.status);
    setLocalTask((prev) => (prev.id === task.id ? mergeFetchedAiTask(prev, task) : task));
  }, [localStatus, task]);

  const unknown = t("common.unknown");
  const config = task.config as { totalProducts?: number };
  const primaryCopy = (() => {
    switch (localStatus) {
      case "running":
        return t(`${i18nPrefix}.cardPrimaryRunning`);
      case "pending_review":
        return summary
          ? t(`${i18nPrefix}.cardPrimaryPendingReview`, {
              changed: summary.changed ?? 0,
              skipped: summary.skipped ?? 0,
              exported: summary.exported ?? 0,
            })
          : t(`${i18nPrefix}.cardPrimaryRunning`);
      case "succeeded":
        return summary
          ? t(`${i18nPrefix}.cardPrimarySucceeded`, {
              exported: summary.exported ?? 0,
              skipped: summary.skipped ?? 0,
            })
          : t(`${i18nPrefix}.cardPrimarySucceeded`, { exported: 0, skipped: 0 });
      case "applied":
        return t(`${i18nPrefix}.cardPrimaryApplied`, {
          succeeded: appliedOutcome?.succeeded ?? 0,
          failed: appliedOutcome?.failed ?? 0,
        });
      case "failed":
        return t(`${i18nPrefix}.cardPrimaryFailed`, {
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
        return t(`${i18nPrefix}.cardPrimaryCancelled`);
      default:
        return t(`${i18nPrefix}.cardPrimaryRunning`);
    }
  })();

  const deleteAction: CardAction = {
    label: deleting ? t("common.deleting") : t("common.delete"),
    tone: "subtle",
    onClick: onDelete,
    disabled: deleting,
  };
  const canPreview =
    hasResult ||
    localStatus === "running" ||
    localStatus === "failed" ||
    localStatus === "cancelled";
  const previewLabelKey = `${i18nPrefix}.actionPreview`;
  const previewLabelTranslated = t(previewLabelKey);
  const previewLabel =
    localStatus === "applied" || localStatus === "succeeded"
      ? t(`${i18nPrefix}.actionViewApplied`)
      : localStatus === "running" && previewLabelTranslated !== previewLabelKey
        ? previewLabelTranslated
        : t(`${i18nPrefix}.actionReview`);
  const actions: CardAction[] = canPreview
    ? [
        {
          label: previewLabel,
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
        title={t(`${i18nPrefix}.cardTitle`)}
        metaLine={
          <>
            <span>{t(`${i18nPrefix}.metaRule`, { rule: ruleLabel })}</span>
            <span style={{ color: pageColorTokens.textFootnote }}>|</span>
            <span>{t(`${i18nPrefix}.metaProducts`, { count: config.totalProducts ?? unknown })}</span>
            {extraMeta ? (
              <>
                <span style={{ color: pageColorTokens.textFootnote }}>|</span>
                <span>{extraMeta}</span>
              </>
            ) : null}
          </>
        }
        primaryCopy={primaryCopy}
        primaryCopyColor={
          localStatus === "failed" ? pageColorTokens.criticalText : pageColorTokens.textPrimary
        }
        secondaryCopy={
          localStatus === "pending_review"
            ? t(`${i18nPrefix}.cardSecondaryPendingReview`)
            : localStatus === "applied"
              ? t(`${i18nPrefix}.cardSecondaryApplied`)
              : localStatus === "succeeded"
                ? t(`${i18nPrefix}.cardSecondarySucceeded`)
                : t(`${i18nPrefix}.cardSecondaryDefault`)
        }
        progressPercent={progressPercentForCatalogTask(localStatus)}
        progressBackground={getTaskStatusTone(localStatus).accent}
        actions={actions}
        showLogViewer={localStatus === "running"}
        onStatusChange={(status, nextResult) => {
          setLocalStatus(status);
          setLocalTask((prev) => ({
            ...prev,
            status,
            result: nextResult ?? prev.result,
            updatedAt: new Date().toISOString(),
          }));
          onTaskUpdated?.(task.id, status, nextResult);
        }}
      />
      {canPreview ? (
        <DialogShell
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          closeDisabled={applying}
          width={920}
          title={t(`${i18nPrefix}.reviewTitle`, { id: task.id.slice(0, 8).toUpperCase() })}
          description={t(`${i18nPrefix}.reviewDescription`)}
          destroyOnHidden
        >
          <DetailPage
            task={localTask}
            onBack={() => setReviewOpen(false)}
            showBackButton={false}
            onTaskUpdated={(taskId, status, nextResult) => {
              setLocalStatus(status);
              setLocalTask((prev) => ({
                ...prev,
                status,
                result: nextResult ?? prev.result,
                updatedAt: new Date().toISOString(),
              }));
              onTaskUpdated?.(taskId, status, nextResult);
            }}
            onBusyChange={setApplying}
          />
        </DialogShell>
      ) : null}
    </>
  );
}
