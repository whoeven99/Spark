import { useEffect, useState } from "react";
import { pageColorTokens, pageEmptyStateStyle } from "../../page/pageUiStyles";
import { ProductImproveTaskCard } from "./ProductImproveTaskCard";
import { TaskListSummary } from "../aiTask/TaskListSummary";
import type { AITaskItem, AITaskStatus } from "../../../lib/aiTaskTypes";

type TaskViewTab = "current" | "history";

function resolveNextActionLabel(status: AITaskStatus): string {
  switch (status) {
    case "running":
      return "等待执行完成并查看流式进度";
    case "pending_review":
      return "优先进入审核，确认标题、描述和修改建议";
    case "scored":
      return "评分已完成，下一步可确认写入 Shopify";
    case "applied":
      return "已完成应用，可回看审核记录与最终结果";
    case "failed":
      return "查看失败原因，必要时重新创建任务";
    default:
      return "在任务卡片中查看当前状态和后续动作";
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
  const actionableTask =
    currentTasks.find((task) => task.status === "pending_review") ??
    currentTasks.find((task) => task.status === "scored") ??
    currentTasks.find((task) => task.status === "running") ??
    currentTasks[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          border: `1px solid ${pageColorTokens.border}`,
          borderRadius: pageColorTokens.radiusCard,
          background: "linear-gradient(160deg, #ffffff 0%, #fafbfd 100%)",
          boxShadow: pageColorTokens.shadowCard,
          padding: "14px 16px",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 18rem", minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: pageColorTokens.textPrimary }}>
            任务工作台
          </div>
          <div style={{ fontSize: 12, color: pageColorTokens.textSecondary, marginTop: 4 }}>
            当前任务页承载执行、审核、评分和应用动作，优先处理待审查与评分完成的任务。
          </div>
        </div>
        {actionableTask ? (
          <div
            style={{
              flex: "1 1 22rem",
              minWidth: 0,
              border: `1px solid ${pageColorTokens.borderSubtle}`,
              borderRadius: pageColorTokens.radiusControl,
              background: pageColorTokens.surfaceSubtle,
              padding: "12px 14px",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: pageColorTokens.textSecondary }}>
              当前优先任务
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: pageColorTokens.textPrimary,
                marginTop: 6,
              }}
            >
              #{actionableTask.id.slice(0, 8).toUpperCase()} ·{" "}
              {String(
                (actionableTask.config as { originalTitle?: string }).originalTitle ?? "商品文案任务",
              )}
            </div>
            <div style={{ fontSize: 12, color: pageColorTokens.textSecondary, marginTop: 6 }}>
              {resolveNextActionLabel(actionableTask.status)}
            </div>
          </div>
        ) : (
          <div
            style={{
              flex: "1 1 18rem",
              minWidth: 0,
              border: `1px dashed ${pageColorTokens.borderSubtle}`,
              borderRadius: pageColorTokens.radiusControl,
              background: pageColorTokens.surfaceSubtle,
              padding: "12px 14px",
              fontSize: 12,
              color: pageColorTokens.textSecondary,
            }}
          >
            当前没有需要优先处理的任务，创建新任务后会自动在这里显示下一步建议。
          </div>
        )}
      </div>

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
