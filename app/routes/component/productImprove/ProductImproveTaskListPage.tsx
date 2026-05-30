import { useEffect, useState } from "react";
import { pageColorTokens, pageEmptyStateStyle } from "../../page/pageUiStyles";
import { ProductImproveTaskCard } from "./ProductImproveTaskCard";
import { ProductImproveTaskDetailPage } from "./ProductImproveTaskDetailPage";
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
        setLocalTasks((prev) => prev.filter((t) => t.id !== taskId));
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
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const currentTasks = sorted.filter(
    (task) => new Date(task.createdAt).getTime() >= cutoff,
  );
  const historyTasks = sorted.filter(
    (task) => new Date(task.createdAt).getTime() < cutoff,
  );
  const visibleTasks = viewTab === "current" ? currentTasks : historyTasks;
  const selectedTask =
    (selectedTaskId ? sorted.find((task) => task.id === selectedTaskId) : null) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {selectedTask ? (
        <ProductImproveTaskDetailPage
          task={selectedTask}
          locationSearch={locationSearch}
          onBack={() => setSelectedTaskId(null)}
          onTaskUpdated={onTaskUpdated}
        />
      ) : visibleTasks.length === 0 ? (
        <>
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
                { key: "current" as const, label: `当前任务 (${currentTasks.length})` },
                { key: "history" as const, label: `历史任务 (${historyTasks.length})` },
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
              历史任务定义为创建时间超过 24 小时的任务。
            </div>
          </div>

          <div
            style={{
              ...pageEmptyStateStyle,
              padding: "2.75rem 1.5rem",
              background: "linear-gradient(160deg, #fafafa 0%, #f5f6f8 100%)",
              border: `1px dashed ${pageColorTokens.borderSubtle}`,
            }}
          >
            <span style={{ fontSize: 28, lineHeight: 1 }}>📋</span>
            <span style={{ fontSize: 14, color: pageColorTokens.textSecondary }}>
              {viewTab === "current"
                ? "当前还没有任务。先在配置页创建一次生成任务。"
                : "暂无超过 24 小时的历史任务记录。"}
            </span>
          </div>
        </>
      ) : (
        <>
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
                { key: "current" as const, label: `当前任务 (${currentTasks.length})` },
                { key: "history" as const, label: `历史任务 (${historyTasks.length})` },
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
              历史任务定义为创建时间超过 24 小时的任务。
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
        </>
      )}
    </div>
  );
}
