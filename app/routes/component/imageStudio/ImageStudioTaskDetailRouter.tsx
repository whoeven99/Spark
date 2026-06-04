import type { AITaskItem, AITaskStatus } from "../../../lib/aiTaskTypes";
import { ImageGenerationTaskDetailPage } from "./ImageGenerationTaskDetailPage";
import { PictureTranslateTaskDetailPage } from "./PictureTranslateTaskDetailPage";

type Props = {
  task: AITaskItem;
  locationSearch: string;
  onBack: () => void;
  onTaskUpdated?: (taskId: string, status: AITaskStatus, result?: Record<string, unknown>) => void;
};

export function ImageStudioTaskDetailRouter({
  task,
  locationSearch,
  onBack,
  onTaskUpdated,
}: Props) {
  if (task.taskType === "image_generation") {
    return (
      <ImageGenerationTaskDetailPage
        task={task}
        locationSearch={locationSearch}
        onBack={onBack}
        onTaskUpdated={onTaskUpdated}
      />
    );
  }

  return (
    <PictureTranslateTaskDetailPage
      task={task}
      locationSearch={locationSearch}
      onBack={onBack}
      onTaskUpdated={onTaskUpdated}
    />
  );
}
