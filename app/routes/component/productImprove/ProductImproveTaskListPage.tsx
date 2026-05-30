import { useEffect, useState } from "react";
import { pageColorTokens, pageEmptyStateStyle } from "../../page/pageUiStyles";
import { ProductImproveTaskCard } from "./ProductImproveTaskCard";
import { TaskListSummary } from "../aiTask/TaskListSummary";
import type { AITaskItem, AITaskStatus } from "../../../lib/aiTaskTypes";

type TaskViewTab = "current" | "history";

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
  const currentTasks = sorted.filter(
    (task) => new Date(task.createdAt).getTime() >= cutoff,
  );
  const historyTasks = sorted.filter(
    (task) => new Date(task.createdAt).getTime() < cutoff,
  );
  const visibleTasks = viewTab === "current" ? currentTasks : historyTasks;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <TaskListSummary tasks={sorted} mode="product_improve" />

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

      {visibleTasks.length === 0 ? (
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
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visibleTasks.map((task) => (
            <ProductImproveTaskCard
              key={task.id}
              task={task}
              locationSearch={locationSearch}
              onDelete={handleDelete}
              onTaskUpdated={onTaskUpdated}
              deleting={deletingId === task.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
