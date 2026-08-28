import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AITaskItem, AITaskStatus } from "../../../lib/aiTaskTypes";
import { AI_TASK_FETCH_INIT } from "../../../lib/aiTaskStatusSync";
import { pageColorTokens, pageEmptyStateStyle } from "../../page/pageUiStyles";
import { useResponsiveLayout } from "../../../hooks/useResponsiveLayout";
import { DialogShell } from "../shared/DialogShell";
import { ProductImproveTaskDetailPage } from "./ProductImproveTaskDetailPage";

type Props = {
  open: boolean;
  taskId: string | null;
  cachedTask?: AITaskItem;
  locationSearch: string;
  remainingPendingCount?: number;
  onClose: () => void;
  onTaskUpdated?: (taskId: string, status: AITaskStatus, result?: Record<string, unknown>) => void;
};

function isUsableProductImproveTask(
  task: AITaskItem | undefined,
  taskId: string,
): task is AITaskItem {
  return Boolean(task && task.id === taskId && task.taskType === "product_improve");
}

async function fetchProductImproveTask(
  taskId: string,
  locationSearch: string,
): Promise<AITaskItem | null> {
  const query = new URLSearchParams(
    locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch,
  );
  const resp = await fetch(
    `/api/ai-task/${encodeURIComponent(taskId)}?${query.toString()}`,
    AI_TASK_FETCH_INIT,
  );
  if (!resp.ok) return null;
  const body = (await resp.json()) as { task?: AITaskItem };
  return body.task?.taskType === "product_improve" ? body.task : null;
}

export function ProductImproveReviewDialog({
  open,
  taskId,
  cachedTask,
  locationSearch,
  remainingPendingCount = 0,
  onClose,
  onTaskUpdated,
}: Props) {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const [fetchedTask, setFetchedTask] = useState<AITaskItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!open || !taskId) {
      setFetchedTask(null);
      setLoadError(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const cacheHit = isUsableProductImproveTask(cachedTask, taskId);
    if (cacheHit) {
      setFetchedTask(cachedTask);
      setLoading(false);
    } else {
      setFetchedTask(null);
      setLoading(true);
    }
    setLoadError(false);

    void fetchProductImproveTask(taskId, locationSearch)
      .then((task) => {
        if (cancelled) return;
        if (task) {
          setFetchedTask(task);
          setLoadError(false);
          return;
        }
        if (!cacheHit) setLoadError(true);
      })
      .catch(() => {
        if (!cancelled && !cacheHit) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // cachedTask 仅作打开瞬间的占位，避免轮询刷新打断弹层内编辑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, taskId, locationSearch]);

  const task = fetchedTask?.id === taskId ? fetchedTask : null;
  const description =
    remainingPendingCount > 0
      ? t("productImproveStage1.reviewDialogRemaining", { count: remainingPendingCount })
      : undefined;

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      width={isMobile ? "calc(100vw - 24px)" : 1080}
      className="spark-dialog-shell--review"
      title={t("productImproveStage1.reviewDialogTitle")}
      description={description}
    >
      {task ? (
        <ProductImproveTaskDetailPage
          task={task}
          locationSearch={locationSearch}
          showBackButton={false}
          onBack={onClose}
          onTaskUpdated={onTaskUpdated}
        />
      ) : (
        <div
          style={{
            ...pageEmptyStateStyle,
            minHeight: 220,
            padding: "2rem 1.25rem",
          }}
        >
          <span style={{ fontSize: 14, color: pageColorTokens.textSecondary }}>
            {loading
              ? t("productImproveStage1.reviewDialogLoading")
              : loadError
                ? t("productImproveStage1.reviewDialogLoadError")
                : t("productImproveStage1.reviewDialogEmptyResult")}
          </span>
        </div>
      )}
    </DialogShell>
  );
}
