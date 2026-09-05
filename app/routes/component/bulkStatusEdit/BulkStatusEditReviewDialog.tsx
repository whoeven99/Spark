/**
 * 批量上下架审核弹窗 —— 任务页卡片用的外壳。
 *
 * 内容与动作区全部来自 BulkStatusEditTaskDetailPage，
 * 对话里的审核 DialogShell 直接挂同一个内容体，两处 UI 不会漂移。
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DialogShell } from "../shared/DialogShell";
import { BulkStatusEditTaskDetailPage } from "./BulkStatusEditTaskDetailPage";
import type { AITaskItem, AITaskStatus } from "../../../lib/aiTaskTypes";

type Props = {
  open: boolean;
  onClose: () => void;
  task: AITaskItem;
  onTaskUpdated?: (
    taskId: string,
    status: AITaskStatus,
    result?: Record<string, unknown>,
  ) => void;
};

export function BulkStatusEditReviewDialog({ open, onClose, task, onTaskUpdated }: Props) {
  const { t } = useTranslation();
  const [applying, setApplying] = useState(false);
  return (
    <DialogShell
      open={open}
      onClose={onClose}
      closeDisabled={applying}
      width={920}
      title={t("bulkStatusEdit.reviewTitle", { id: task.id.slice(0, 8).toUpperCase() })}
      description={t("bulkStatusEdit.reviewDescription")}
      destroyOnHidden
    >
      <BulkStatusEditTaskDetailPage
        task={task}
        onBack={onClose}
        showBackButton={false}
        onTaskUpdated={onTaskUpdated}
        onBusyChange={setApplying}
      />
    </DialogShell>
  );
}
