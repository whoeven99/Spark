import { useState } from "react";
import { pageColorTokens } from "../../page/pageUiStyles";
import { TaskStatusBadge } from "../aiTask/TaskStatusBadge";
import { LogViewer } from "../aiTask/LogViewer";
import type {
  AITaskItem,
  AITaskStatus,
  ProductImproveTaskConfig,
  ProductImproveTaskResult,
} from "../../../lib/aiTaskTypes";

type Props = {
  task: AITaskItem;
  locationSearch: string;
  onDelete: (taskId: string) => void;
  deleting: boolean;
};

function formatActualElapsed(startedAt: string | null, completedAt: string | null): string | null {
  if (!startedAt || !completedAt) return null;
  const elapsedMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const s = Math.floor(elapsedMs / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

export function ProductImproveTaskCard({ task, locationSearch, onDelete, deleting }: Props) {
  const [localStatus, setLocalStatus] = useState<AITaskStatus>(task.status);
  const [localResult, setLocalResult] = useState<Record<string, unknown> | null>(task.result);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const cfg = task.config as Partial<ProductImproveTaskConfig>;
  const result = localResult as Partial<ProductImproveTaskResult> | null;
  const shortId = task.id.slice(0, 8).toUpperCase();
  const actualElapsed = formatActualElapsed(task.startedAt, task.completedAt);

  function handleStatusChange(status: AITaskStatus, r?: Record<string, unknown>) {
    setLocalStatus(status);
    if (r) setLocalResult(r);
  }

  async function handleApply() {
    if (!result?.title || !result?.description) return;
    setApplying(true);
    setApplyError(null);
    try {
      // Write to Shopify
      const updateResp = await fetch(`/api/update-product-description${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: cfg.productId,
          title: result.title,
          descriptionPlain: result.description,
        }),
      });
      const updateBody = (await updateResp.json()) as { success: boolean; errorMsg?: string };
      if (!updateBody.success) {
        setApplyError(updateBody.errorMsg ?? "写入 Shopify 失败");
        return;
      }
      // Mark task as applied
      await fetch(`/api/ai-task${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", taskId: task.id }),
      });
      setLocalStatus("applied");
    } catch {
      setApplyError("应用时发生网络错误");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div
      style={{
        border: `1px solid ${pageColorTokens.border}`,
        borderRadius: pageColorTokens.radiusCard,
        padding: "14px 16px",
        background: pageColorTokens.surface,
        boxShadow: pageColorTokens.shadowCard,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: pageColorTokens.textPrimary }}>
              #{shortId}
            </span>
            <TaskStatusBadge status={localStatus} />
          </div>

          {/* Meta line */}
          <div style={{ fontSize: 12, color: pageColorTokens.textSecondary, display: "flex", gap: 4, flexWrap: "wrap" }}>
            <span>商品文案</span>
            {cfg.targetLanguage && (
              <>
                <span style={{ color: pageColorTokens.textFootnote }}>·</span>
                <span>{cfg.targetLanguage}</span>
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
          </div>

          {/* Product title */}
          {cfg.originalTitle && (
            <div
              style={{
                fontSize: 13,
                color: pageColorTokens.textBody,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                marginTop: 4,
              }}
            >
              {cfg.originalTitle}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onDelete(task.id)}
          disabled={deleting}
          style={{
            background: "none",
            border: "none",
            cursor: deleting ? "default" : "pointer",
            color: deleting ? pageColorTokens.textFootnote : pageColorTokens.critical,
            fontSize: 13,
            padding: "4px 0",
            flexShrink: 0,
          }}
        >
          {deleting ? "删除中" : "删除"}
        </button>
      </div>

      <LogViewer
        taskId={task.id}
        taskType={task.taskType}
        status={localStatus}
        locationSearch={locationSearch}
        startedAt={task.startedAt}
        completedAt={task.completedAt}
        initialLogs={[]}
        defaultLogsOpen={localStatus === "running"}
        onStatusChange={handleStatusChange}
      />

      {/* Pending review: show before/after + apply button */}
      {localStatus === "pending_review" && result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Before */}
          <div
            style={{
              border: `1px solid ${pageColorTokens.border}`,
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                background: "#fff3cd",
                color: "#856404",
                fontSize: 11,
                fontWeight: 700,
                padding: "4px 10px",
                letterSpacing: "0.05em",
              }}
            >
              BEFORE
            </div>
            <div style={{ padding: "10px 12px" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: pageColorTokens.textPrimary, marginBottom: 4 }}>
                {cfg.originalTitle}
              </div>
              <div style={{ fontSize: 12, color: pageColorTokens.textSecondary, maxHeight: 80, overflowY: "auto" }}>
                {cfg.originalText || "（无原始描述）"}
              </div>
            </div>
          </div>

          {/* After */}
          <div
            style={{
              border: `1px solid ${pageColorTokens.brandGreen}`,
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                background: pageColorTokens.brandGreenLight,
                color: pageColorTokens.brandGreenDark,
                fontSize: 11,
                fontWeight: 700,
                padding: "4px 10px",
                letterSpacing: "0.05em",
              }}
            >
              AFTER
            </div>
            <div style={{ padding: "10px 12px" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: pageColorTokens.textPrimary, marginBottom: 4 }}>
                {result.title}
              </div>
              <div style={{ fontSize: 12, color: pageColorTokens.textBody, maxHeight: 120, overflowY: "auto" }}>
                {result.description}
              </div>
            </div>
          </div>

          {applyError && (
            <div
              style={{
                fontSize: 12,
                color: pageColorTokens.criticalText,
                background: pageColorTokens.criticalBg,
                padding: "6px 10px",
                borderRadius: 6,
              }}
            >
              {applyError}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={applying}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                background: applying ? pageColorTokens.surfaceMuted : pageColorTokens.brandGreen,
                color: applying ? pageColorTokens.textSecondary : "#fff",
                border: "none",
                cursor: applying ? "default" : "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {applying ? "应用中..." : "写入 Shopify"}
            </button>
            <button
              type="button"
              onClick={() => onDelete(task.id)}
              disabled={deleting}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                background: pageColorTokens.surfaceMuted,
                color: pageColorTokens.textBody,
                border: `1px solid ${pageColorTokens.border}`,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              丢弃
            </button>
          </div>
        </div>
      )}

      {/* Applied */}
      {localStatus === "applied" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            background: pageColorTokens.brandGreenLight,
            borderRadius: 8,
            fontSize: 13,
            color: pageColorTokens.brandGreenDark,
            fontWeight: 500,
          }}
        >
          <span>✓</span>
          <span>已写入 Shopify</span>
          {result?.title && (
            <span style={{ color: pageColorTokens.textSecondary, fontWeight: 400 }}>
              · {result.title as string}
            </span>
          )}
        </div>
      )}

      {/* Failed */}
      {localStatus === "failed" && task.errorMsg && (
        <div
          style={{
            fontSize: 12,
            color: pageColorTokens.criticalText,
            background: pageColorTokens.criticalBg,
            padding: "8px 10px",
            borderRadius: 8,
          }}
        >
          {task.errorMsg}
        </div>
      )}
    </div>
  );
}
