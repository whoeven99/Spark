import { useNavigate } from "react-router";
import { ProductImproveTaskCard } from "../productImprove/ProductImproveTaskCard";
import { BulkPriceEditTaskCard } from "../bulkPriceEdit/BulkPriceEditTaskCard";
import { BulkTagEditTaskCard } from "../bulkTagEdit/BulkTagEditTaskCard";
import { BulkStatusEditTaskCard } from "../bulkStatusEdit/BulkStatusEditTaskCard";
import { BulkCollectionEditTaskCard } from "../bulkCollectionEdit/BulkCollectionEditTaskCard";
import { BulkSeoEditTaskCard } from "../bulkSeoEdit/BulkSeoEditTaskCard";
import { BulkPriceImportTaskCard } from "../bulkPriceImport/BulkPriceImportTaskCard";
import { BulkCostImportTaskCard } from "../bulkCostImport/BulkCostImportTaskCard";
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

  if (task.taskType === "bulk_price_edit") {
    return (
      <BulkPriceEditTaskCard
        task={task}
        locationSearch={locationSearch}
        onDelete={() => onAITaskDeleted(task.id)}
        onTaskUpdated={onTaskUpdated}
        deleting={deleting}
      />
    );
  }

  if (task.taskType === "bulk_tag_edit") {
    return (
      <BulkTagEditTaskCard
        task={task}
        locationSearch={locationSearch}
        onDelete={() => onAITaskDeleted(task.id)}
        onTaskUpdated={onTaskUpdated}
        deleting={deleting}
      />
    );
  }

  if (task.taskType === "bulk_status_edit") {
    return (
      <BulkStatusEditTaskCard
        task={task}
        locationSearch={locationSearch}
        onDelete={() => onAITaskDeleted(task.id)}
        onTaskUpdated={onTaskUpdated}
        deleting={deleting}
      />
    );
  }

  if (task.taskType === "bulk_collection_edit") {
    return (
      <BulkCollectionEditTaskCard
        task={task}
        locationSearch={locationSearch}
        onDelete={() => onAITaskDeleted(task.id)}
        onTaskUpdated={onTaskUpdated}
        deleting={deleting}
      />
    );
  }

  if (task.taskType === "bulk_seo_edit") {
    return (
      <BulkSeoEditTaskCard
        task={task}
        locationSearch={locationSearch}
        onDelete={() => onAITaskDeleted(task.id)}
        onTaskUpdated={onTaskUpdated}
        deleting={deleting}
      />
    );
  }

  if (task.taskType === "bulk_price_import") {
    return (
      <BulkPriceImportTaskCard
        task={task}
        locationSearch={locationSearch}
        onDelete={() => onAITaskDeleted(task.id)}
        onTaskUpdated={onTaskUpdated}
        deleting={deleting}
      />
    );
  }

  if (task.taskType === "bulk_cost_import") {
    return (
      <BulkCostImportTaskCard
        task={task}
        locationSearch={locationSearch}
        onDelete={() => onAITaskDeleted(task.id)}
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
