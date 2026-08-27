import { useNavigate } from "react-router";
import { ProductImproveTaskCard } from "../productImprove/ProductImproveTaskCard";
import { TaskCard } from "../aiTask/TaskCard";
import type { UnifiedTaskEntry } from "../../../lib/unifiedTaskTypes";
import type { AITaskStatus } from "../../../lib/aiTaskTypes";
import { OperationTaskCard } from "./OperationTaskCard";
import { AutomationTaskCard } from "./AutomationTaskCard";
import { buildProductImprovePath } from "../../../lib/productImproveDeepLink";
import { appendEmbeddedSearchToPath } from "../../../lib/embeddedLocationSearch";

type Props = {
  entry: UnifiedTaskEntry;
  locationSearch: string;
  onAITaskDeleted: (taskId: string) => void;
  onOperationTaskUpdated?: () => void;
  onTaskUpdated?: (taskId: string, status: AITaskStatus, result?: Record<string, unknown>) => void;
  deleting?: boolean;
};

export function UnifiedTaskCard({
  entry,
  locationSearch,
  onAITaskDeleted,
  onOperationTaskUpdated,
  onTaskUpdated,
  deleting = false,
}: Props) {
  const navigate = useNavigate();
  if (entry.entryType === "automation_task") {
    return <AutomationTaskCard task={entry.task} />;
  }
  if (entry.entryType === "operation_task") {
    return (
      <OperationTaskCard
        task={entry.task}
        locationSearch={locationSearch}
        onUpdated={onOperationTaskUpdated}
      />
    );
  }

  const { task } = entry;

  if (task.taskType === "product_improve") {
    return (
      <ProductImproveTaskCard
        task={task}
        locationSearch={locationSearch}
        onDelete={() => onAITaskDeleted(task.id)}
        onOpenDetail={() => {
          void navigate(
            appendEmbeddedSearchToPath(
              buildProductImprovePath({ tab: "tasks", taskId: task.id }),
              locationSearch,
            ),
          );
        }}
        onTaskUpdated={onTaskUpdated}
        deleting={deleting}
      />
    );
  }

  // image_generation and picture_translate
  return (
    <TaskCard
      task={task}
      locationSearch={locationSearch}
      onDelete={onAITaskDeleted}
      deleting={deleting}
    />
  );
}
