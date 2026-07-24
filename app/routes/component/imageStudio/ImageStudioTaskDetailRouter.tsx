import type { AITaskItem, AITaskStatus, AITaskType } from "../../../lib/aiTaskTypes";
import { ImageGenerationTaskDetailPage } from "./ImageGenerationTaskDetailPage";
import { PictureTranslateTaskDetailPage } from "./PictureTranslateTaskDetailPage";

type Props = {
  task: AITaskItem;
  locationSearch: string;
  onBack: () => void;
  onTaskUpdated?: (taskId: string, status: AITaskStatus, result?: Record<string, unknown>) => void;
  onTaskCreated?: (
    taskId: string,
    batchId: string,
    taskType: AITaskType,
    optimisticConfig?: Record<string, unknown>,
  ) => void;
};

export function ImageStudioTaskDetailRouter({
  task,
  locationSearch,
  onBack,
  onTaskUpdated,
  onTaskCreated,
}: Props) {
  if (task.taskType === "image_generation") {
    return (
      <ImageGenerationTaskDetailPage
        task={task}
        locationSearch={locationSearch}
        onBack={onBack}
        onTaskUpdated={onTaskUpdated}
        onTaskCreated={onTaskCreated}
      />
    );
  }

  return (
    <PictureTranslateTaskDetailPage
      task={task}
      locationSearch={locationSearch}
      onBack={onBack}
      onTaskUpdated={onTaskUpdated}
      onTaskCreated={onTaskCreated}
    />
  );
}
