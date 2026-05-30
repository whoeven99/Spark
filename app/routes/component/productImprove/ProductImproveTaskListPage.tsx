import { useEffect, useState } from "react";
import { Empty, Tag } from "antd";
import { useTranslation } from "react-i18next";
import { ProductImproveTaskCard } from "./ProductImproveTaskCard";
import { ProductImproveTaskDetailPage } from "./ProductImproveTaskDetailPage";
import { TaskListSummary } from "../aiTask/TaskListSummary";
import type { AITaskItem, AITaskStatus } from "../../../lib/aiTaskTypes";

type TaskViewTab = "current" | "history";

function getTaskPriority(status: AITaskStatus): number {
  switch (status) {
    case "pending_review":
      return 1;
    case "scored":
      return 2;
    case "running":
      return 3;
    case "failed":
      return 4;
    case "applied":
      return 5;
    default:
      return 6;
  }
}

type Props = {
  tasks: AITaskItem[];
  locationSearch: string;
  onTaskDeleted: (taskId: string) => void;
  onTaskUpdated?: (taskId: string, status: AITaskStatus, result?: Record<string, unknown>) => void;
};

export function ProductImproveTaskListPage({
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
  const [cutoffMs] = useState(() => Date.now() - 24 * 60 * 60 * 1000);

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

  const sorted = [...localTasks].sort((a, b) => {
    const priorityDiff = getTaskPriority(a.status) - getTaskPriority(b.status);
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const cutoff = cutoffMs;
  const currentTasks = sorted.filter(
    (task) => new Date(task.createdAt).getTime() >= cutoff,
  );
  const historyTasks = sorted.filter(
    (task) => new Date(task.createdAt).getTime() < cutoff,
  );
  const visibleTasks = viewTab === "current" ? currentTasks : historyTasks;
  const selectedTask =
    (selectedTaskId ? sorted.find((task) => task.id === selectedTaskId) : null) ?? null;

  const taskViewTabs = (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-full border border-app-subtle bg-app-muted p-1">
      <div className="flex flex-wrap gap-1 p-0.5">
        {(
          [
            { key: "current" as const, count: currentTasks.length },
            { key: "history" as const, count: historyTasks.length },
          ] as const
        ).map(({ key, count }) => {
          const active = viewTab === key;
          const label =
            key === "current"
              ? t("productImproveStage1.taskViewCurrent")
              : t("productImproveStage1.taskViewHistory");
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setViewTab(key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
                active
                  ? "border border-app-subtle bg-app-card text-app-text-primary shadow-app-card"
                  : "border border-transparent bg-transparent text-app-text-secondary hover:text-app-text-primary"
              }`}
            >
              {label}
              <Tag bordered={false} className="m-0 rounded-full bg-app-muted px-2 py-0 text-[11px]">
                {count}
              </Tag>
            </button>
          );
        })}
      </div>
      <span className="px-3 text-xs text-app-text-secondary">
        {t("productImproveStage1.taskHistoryHint")}
      </span>
    </div>
  );

  if (selectedTask) {
    return (
      <div className="space-y-3">
        <ProductImproveTaskDetailPage
          task={selectedTask}
          locationSearch={locationSearch}
          onBack={() => setSelectedTaskId(null)}
          onTaskUpdated={onTaskUpdated}
        />
      </div>
    );
  }

  if (visibleTasks.length === 0) {
    return (
      <div className="space-y-3">
        <TaskListSummary tasks={sorted} mode="product_improve" />
        {taskViewTabs}
        <Empty
          className="spark-ant-empty rounded-app-card border border-dashed border-app-subtle bg-app-subtle py-10"
          description={
            viewTab === "current"
              ? t("productImproveStage1.taskEmptyCurrent")
              : t("productImproveStage1.taskEmptyHistory")
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <TaskListSummary tasks={sorted} mode="product_improve" />
      {taskViewTabs}
      <div className="flex flex-col gap-2.5">
        {visibleTasks.map((task) => (
          <ProductImproveTaskCard
            key={task.id}
            task={task}
            locationSearch={locationSearch}
            onDelete={handleDelete}
            onOpenDetail={() => setSelectedTaskId(task.id)}
            onTaskUpdated={onTaskUpdated}
            deleting={deletingId === task.id}
          />
        ))}
      </div>
    </div>
  );
}
