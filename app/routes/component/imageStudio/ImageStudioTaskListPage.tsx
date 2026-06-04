import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens, pageEmptyStateStyle } from "../../page/pageUiStyles";
import type { AITaskItem, AITaskStatus } from "../../../lib/aiTaskTypes";
import { ImageGenerationTaskCard } from "./ImageGenerationTaskCard";
import { PictureTranslateTaskCard } from "./PictureTranslateTaskCard";
import { ImageStudioTaskDetailRouter } from "./ImageStudioTaskDetailRouter";

type TaskViewTab = "current" | "history";

type Props = {
  tasks: AITaskItem[];
  locationSearch: string;
  onTaskDeleted: (taskId: string) => void;
  onTaskUpdated?: (taskId: string, status: AITaskStatus, result?: Record<string, unknown>) => void;
};

export function ImageStudioTaskListPage({
  tasks,
  locationSearch,
  onTaskDeleted,
  onTaskUpdated,
}: Props) {
  const { t } = useTranslation();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [localTasks, setLocalTasks] = useState<AITaskItem[]>(tasks);
  const [viewTab, setViewTab] = useState<TaskViewTab>("current");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  async function handleDelete(taskId: string) {
    setDeletingId(taskId);
    try {
      const resp = await fetch(`/api/ai-task${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", taskId }),
      });
      if (resp.ok) {
        setLocalTasks((prev) => prev.filter((task) => task.id !== taskId));
        setSelectedTaskId((prev) => (prev === taskId ? null : prev));
        onTaskDeleted(taskId);
      }
    } finally {
      setDeletingId(null);
    }
  }

  const sorted = [...localTasks].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const currentTasks = sorted.filter((task) => new Date(task.createdAt).getTime() >= cutoff);
  const historyTasks = sorted.filter((task) => new Date(task.createdAt).getTime() < cutoff);
  const visibleTasks = viewTab === "current" ? currentTasks : historyTasks;
  const selectedTask = selectedTaskId ? sorted.find((task) => task.id === selectedTaskId) ?? null : null;

  if (selectedTask) {
    return (
      <ImageStudioTaskDetailRouter
        task={selectedTask}
        locationSearch={locationSearch}
        onBack={() => setSelectedTaskId(null)}
        onTaskUpdated={onTaskUpdated}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          padding: "0.5rem",
          borderRadius: 999,
          background: pageColorTokens.surfaceMuted,
          border: `1px solid ${pageColorTokens.borderSubtle}`,
        }}
      >
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            {
              key: "current" as const,
              label: t("imageStudio.currentTasksTab", { count: currentTasks.length }),
            },
            {
              key: "history" as const,
              label: t("imageStudio.historyTasksTab", { count: historyTasks.length }),
            },
          ].map((tab) => {
            const active = viewTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setViewTab(tab.key)}
                style={{
                  padding: "0.5rem 0.9rem",
                  borderRadius: 999,
                  border: `1px solid ${active ? pageColorTokens.borderSubtle : "transparent"}`,
                  background: active ? pageColorTokens.surface : "transparent",
                  color: active ? pageColorTokens.textPrimary : pageColorTokens.textSecondary,
                  boxShadow: active ? pageColorTokens.shadowCard : "none",
                  fontSize: 13,
                  fontWeight: active ? 700 : 600,
                  cursor: "pointer",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
          {t("imageStudio.historyTasksHint")}
        </div>
      </div>

      {visibleTasks.length === 0 ? (
        <div style={pageEmptyStateStyle}>
          <span style={{ fontSize: 28, lineHeight: 1 }}>🖼️</span>
          <span>
            {viewTab === "current"
              ? t("imageStudio.currentTasksEmpty")
              : t("imageStudio.historyTasksEmpty")}
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visibleTasks.map((task) =>
            task.taskType === "image_generation" ? (
              <ImageGenerationTaskCard
                key={task.id}
                task={task}
                locationSearch={locationSearch}
                onDelete={handleDelete}
                onOpenDetail={() => setSelectedTaskId(task.id)}
                onTaskUpdated={onTaskUpdated}
                deleting={deletingId === task.id}
              />
            ) : (
              <PictureTranslateTaskCard
                key={task.id}
                task={task}
                locationSearch={locationSearch}
                onDelete={handleDelete}
                onOpenDetail={() => setSelectedTaskId(task.id)}
                onTaskUpdated={onTaskUpdated}
                deleting={deletingId === task.id}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}
