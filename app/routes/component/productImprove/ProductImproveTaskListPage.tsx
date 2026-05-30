import { useEffect, useState } from "react";
import { pageColorTokens, pageEmptyStateStyle } from "../../page/pageUiStyles";
import { ProductImproveTaskCard } from "./ProductImproveTaskCard";
import { TaskListSummary } from "../aiTask/TaskListSummary";
import type { AITaskItem, AITaskStatus } from "../../../lib/aiTaskTypes";

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <TaskListSummary tasks={sorted} mode="product_improve" />

      {sorted.length === 0 ? (
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
            还没有任务。先在配置页发起一次生成或评分。
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map((task) => (
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
