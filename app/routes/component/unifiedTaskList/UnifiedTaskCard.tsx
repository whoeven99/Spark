import { useNavigate } from "react-router";
import { ProductImproveTaskCard } from "../productImprove/ProductImproveTaskCard";
import { TaskCard } from "../aiTask/TaskCard";
import { TranslationV4TaskCard } from "./TranslationV4TaskCard";
import type { UnifiedTaskEntry } from "../../../lib/unifiedTaskTypes";
import type { AITaskStatus } from "../../../lib/aiTaskTypes";

type Props = {
  entry: UnifiedTaskEntry;
  locationSearch: string;
  onAITaskDeleted: (taskId: string) => void;
  onTaskUpdated?: (taskId: string, status: AITaskStatus, result?: Record<string, unknown>) => void;
  deleting?: boolean;
};

export function UnifiedTaskCard({
  entry,
  locationSearch,
  onAITaskDeleted,
  onTaskUpdated,
  deleting = false,
}: Props) {
  const navigate = useNavigate();

  if (entry.entryType === "translation_v4") {
    return <TranslationV4TaskCard job={entry.job} />;
  }

  const { task } = entry;

  if (task.taskType === "product_improve") {
    return (
      <ProductImproveTaskCard
        task={task}
        locationSearch={locationSearch}
        onDelete={() => onAITaskDeleted(task.id)}
        onOpenDetail={() => {
          void navigate(`/app/studio/copy${locationSearch}`);
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
