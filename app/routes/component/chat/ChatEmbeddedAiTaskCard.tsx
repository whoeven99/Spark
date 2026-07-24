import { useState } from "react";
import type { AITaskItem, AITaskStatus } from "../../../lib/aiTaskTypes";
import { ImageGenerationTaskCard } from "../imageStudio/ImageGenerationTaskCard";
import { PictureTranslateTaskCard } from "../imageStudio/PictureTranslateTaskCard";

type Props = {
  task: AITaskItem;
  locationSearch: string;
  onOpenTasks?: () => void;
  onTaskUpdated?: (taskId: string, status: AITaskStatus, result?: Record<string, unknown>) => void;
};

export function ChatEmbeddedAiTaskCard({
  task,
  locationSearch,
  onOpenTasks,
  onTaskUpdated,
}: Props) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch(`/api/ai-task${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", taskId: task.id }),
      });
    } finally {
      setDeleting(false);
    }
  };

  const common = {
    task,
    locationSearch,
    onDelete: () => void handleDelete(),
    onOpenDetail: () => onOpenTasks?.(),
    onTaskUpdated,
    deleting,
  };

  if (task.taskType === "picture_translate") {
    return <PictureTranslateTaskCard {...common} />;
  }

  return <ImageGenerationTaskCard {...common} />;
}
