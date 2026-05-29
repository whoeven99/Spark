import { useEffect, useState } from "react";
import { pageColorTokens } from "../../page/pageUiStyles";
import { ProductImproveTaskCard } from "./ProductImproveTaskCard";
import { TaskListSummary } from "../aiTask/TaskListSummary";
import type { AITaskItem } from "../../../lib/aiTaskTypes";

type Props = {
  tasks: AITaskItem[];
  locationSearch: string;
  onTaskDeleted: (taskId: string) => void;
};

export function ProductImproveTaskListPage({ tasks, locationSearch, onTaskDeleted }: Props) {
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
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <TaskListSummary tasks={sorted} mode="product_improve" />

      {sorted.length === 0 ? (
        <div
          style={{
            border: `1px solid ${pageColorTokens.border}`,
            borderRadius: pageColorTokens.radiusCard,
            background: pageColorTokens.surface,
            padding: "40px 24px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
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
              deleting={deletingId === task.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
