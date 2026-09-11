import { useTranslation } from "react-i18next";
import type { AITaskItem, AITaskStatus } from "../../../lib/aiTaskTypes";
import { BulkPriceEditTaskDetailPage } from "../bulkPriceEdit/BulkPriceEditTaskDetailPage";
import { BulkStatusEditTaskDetailPage } from "../bulkStatusEdit/BulkStatusEditTaskDetailPage";
import { BulkTagEditTaskDetailPage } from "../bulkTagEdit/BulkTagEditTaskDetailPage";
import { resolveChatReviewDialogTitleKey } from "../chat/chatInlineReviewTasks";
import { ImageGenerationTaskDetailPage } from "../imageStudio/ImageGenerationTaskDetailPage";
import { PictureTranslateTaskDetailPage } from "../imageStudio/PictureTranslateTaskDetailPage";
import { ProductImproveTaskDetailPage } from "../productImprove/ProductImproveTaskDetailPage";
import { DialogShell } from "../shared/DialogShell";

type TaskUpdatedHandler = (
  taskId: string,
  status: AITaskStatus,
  result?: Record<string, unknown>,
) => void;

/**
 * 结果与审核弹窗：直接复用对话内审核那套详情组件，
 * 保证任务页和对话里看到的是同一份 UI（见根 AGENTS.md 第 7 节）。
 */
export function TaskDetailDialog({
  task,
  locationSearch,
  onClose,
  onTaskUpdated,
}: {
  task: AITaskItem | null;
  locationSearch: string;
  onClose: () => void;
  onTaskUpdated: TaskUpdatedHandler;
}) {
  const { t } = useTranslation();

  return (
    <DialogShell
      open={Boolean(task)}
      onClose={onClose}
      width={960}
      title={t(resolveChatReviewDialogTitleKey(task?.taskType))}
    >
      {task?.taskType === "product_improve" ? (
        <ProductImproveTaskDetailPage
          task={task}
          locationSearch={locationSearch}
          onBack={onClose}
          showBackButton={false}
          onTaskUpdated={onTaskUpdated}
        />
      ) : task?.taskType === "picture_translate" ? (
        <PictureTranslateTaskDetailPage
          task={task}
          locationSearch={locationSearch}
          onBack={onClose}
          showBackButton={false}
          onTaskUpdated={onTaskUpdated}
        />
      ) : task?.taskType === "image_generation" ? (
        <ImageGenerationTaskDetailPage
          task={task}
          locationSearch={locationSearch}
          onBack={onClose}
          showBackButton={false}
          onTaskUpdated={onTaskUpdated}
        />
      ) : task?.taskType === "bulk_price_edit" ? (
        <BulkPriceEditTaskDetailPage
          task={task}
          onBack={onClose}
          showBackButton={false}
          onTaskUpdated={onTaskUpdated}
        />
      ) : task?.taskType === "bulk_tag_edit" ? (
        <BulkTagEditTaskDetailPage
          task={task}
          onBack={onClose}
          showBackButton={false}
          onTaskUpdated={onTaskUpdated}
        />
      ) : task?.taskType === "bulk_status_edit" ? (
        <BulkStatusEditTaskDetailPage
          task={task}
          onBack={onClose}
          showBackButton={false}
          onTaskUpdated={onTaskUpdated}
        />
      ) : null}
    </DialogShell>
  );
}
