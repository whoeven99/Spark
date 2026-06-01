import { useEffect, useState } from "react";
import { pageColorTokens } from "../../page/pageUiStyles";
import { TaskStatusBadge } from "../aiTask/TaskStatusBadge";
import { LogViewer } from "../aiTask/LogViewer";
import type {
  AITaskItem,
  AITaskStatus,
  ProductImproveTaskConfig,
} from "../../../lib/aiTaskTypes";

type Props = {
  task: AITaskItem;
  locationSearch: string;
  onDelete: (taskId: string) => void;
  onOpenDetail: () => void;
  onTaskUpdated?: (taskId: string, status: AITaskStatus, result?: Record<string, unknown>) => void;
  deleting: boolean;
};

function formatActualElapsed(startedAt: string | null, completedAt: string | null): string | null {
  if (!startedAt || !completedAt) return null;
  const elapsedMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const s = Math.floor(elapsedMs / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function formatTaskDate(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resolvePrimaryActionLabel(status: AITaskStatus): string {
  switch (status) {
    case "pending_review":
      return "进入审核页";
    case "running":
      return "查看任务详情";
    case "applied":
      return "查看应用详情";
    case "failed":
      return "查看失败详情";
    default:
      return "查看详情";
  }
}

export function ProductImproveTaskCard({
  task,
  locationSearch,
  onDelete,
  onOpenDetail,
  onTaskUpdated,
  deleting,
}: Props) {
  const [localStatus, setLocalStatus] = useState<AITaskStatus>(task.status);
  const cfg = task.config as Partial<ProductImproveTaskConfig>;
  const shortId = task.id.slice(0, 8).toUpperCase();
  const actualElapsed = formatActualElapsed(task.startedAt, task.completedAt);
  const showExecutionRecord = localStatus === "running";

  useEffect(() => {
    setLocalStatus(task.status);
  }, [task.status]);

  return (
    <div
      style={{
        border: `1px solid ${pageColorTokens.border}`,
        borderRadius: pageColorTokens.radiusCard,
        padding: "12px 14px",
        background: "#fff",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 20rem", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: pageColorTokens.textSecondary,
                padding: "0.2rem 0.5rem",
                borderRadius: 999,
                background: pageColorTokens.surfaceMuted,
                border: `1px solid ${pageColorTokens.borderSubtle}`,
              }}
            >
              #{shortId}
            </span>
            <TaskStatusBadge status={localStatus} />
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: pageColorTokens.textPrimary,
              marginTop: 6,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {cfg.originalTitle || "商品文案任务"}
          </div>
          <div
            style={{
              fontSize: 12,
              color: pageColorTokens.textSecondary,
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              marginTop: 6,
            }}
          >
            <span>创建于 {formatTaskDate(task.createdAt)}</span>
            {cfg.targetLanguage && (
              <>
                <span style={{ color: pageColorTokens.textFootnote }}>·</span>
                <span>语言 {cfg.targetLanguage}</span>
              </>
            )}
            {localStatus === "running" && (
              <>
                <span style={{ color: pageColorTokens.textFootnote }}>·</span>
                <span>预估约 1–2 分钟</span>
              </>
            )}
            {localStatus !== "running" && actualElapsed && (
              <>
                <span style={{ color: pageColorTokens.textFootnote }}>·</span>
                <span>实际耗时 {actualElapsed}</span>
              </>
            )}
            {cfg.productId && (
              <>
                <span style={{ color: pageColorTokens.textFootnote }}>·</span>
                <span>ID {cfg.productId}</span>
              </>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={onOpenDetail}
            style={{
              padding: "7px 14px",
              borderRadius: pageColorTokens.radiusControl,
              background: pageColorTokens.surface,
              color: pageColorTokens.textBody,
              border: `1px solid ${pageColorTokens.borderSubtle}`,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {resolvePrimaryActionLabel(localStatus)}
          </button>
          <button
            type="button"
            onClick={() => onDelete(task.id)}
            disabled={deleting}
            style={{
              padding: "7px 14px",
              borderRadius: pageColorTokens.radiusControl,
              background: pageColorTokens.surfaceSubtle,
              color: deleting ? pageColorTokens.textFootnote : pageColorTokens.textBody,
              border: `1px solid ${pageColorTokens.borderSubtle}`,
              cursor: deleting ? "default" : "pointer",
              fontSize: 13,
            }}
          >
            {deleting ? "删除中" : "删除"}
          </button>
        </div>
      </div>

      {showExecutionRecord ? (
        <LogViewer
          taskId={task.id}
          taskType={task.taskType}
          status={localStatus}
          locationSearch={locationSearch}
          startedAt={task.startedAt}
          completedAt={task.completedAt}
          initialLogs={[]}
          defaultLogsOpen={false}
          onStatusChange={(status, result) => {
            setLocalStatus(status);
            onTaskUpdated?.(task.id, status, result);
          }}
        />
      ) : null}
    </div>
  );
}
