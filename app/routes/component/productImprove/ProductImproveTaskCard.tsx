import { useCallback, useEffect, useRef, useState } from "react";
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

function ReviewContentPanel(props: {
  label: string;
  tone?: "neutral" | "positive";
  title: string;
  description: string;
  editable?: boolean;
  disabled?: boolean;
  onTitleChange?: (value: string) => void;
  onDescriptionChange?: (value: string) => void;
  descriptionRows?: number;
}) {
  const tone = props.tone ?? "neutral";
  const headerBg =
    tone === "positive" ? pageColorTokens.brandGreenLight : pageColorTokens.surfaceMuted;
  const headerColor =
    tone === "positive" ? pageColorTokens.brandGreenDark : pageColorTokens.textSecondary;
  const borderColor =
    tone === "positive" ? "rgba(0, 166, 124, 0.18)" : pageColorTokens.borderSubtle;

  return (
    <div
      style={{
        border: `1px solid ${borderColor}`,
        borderRadius: pageColorTokens.radiusControl,
        background: tone === "positive" ? "#fcfffd" : pageColorTokens.surfaceSubtle,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "8px 10px",
          background: headerBg,
          fontSize: 11,
          fontWeight: 700,
          color: headerColor,
          letterSpacing: "0.04em",
        }}
      >
        {props.label}
      </div>
      <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: pageColorTokens.textSecondary,
              marginBottom: 6,
            }}
          >
            标题
          </div>
          {props.editable ? (
            <input
              value={props.title}
              onChange={(e) => props.onTitleChange?.(e.currentTarget.value)}
              disabled={props.disabled}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "0.65rem 0.75rem",
                borderRadius: pageColorTokens.radiusControl,
                border: `1px solid ${pageColorTokens.borderInput}`,
                fontSize: 13,
                fontWeight: 600,
                color: pageColorTokens.textPrimary,
                background: "#fff",
              }}
            />
          ) : (
            <div
              style={{
                border: `1px solid ${pageColorTokens.borderSubtle}`,
                borderRadius: pageColorTokens.radiusControl,
                padding: "0.7rem 0.8rem",
                fontSize: 13,
                fontWeight: 600,
                color: pageColorTokens.textPrimary,
                background: "#fff",
                minHeight: 42,
                boxSizing: "border-box",
              }}
            >
              {props.title || "（无标题）"}
            </div>
          )}
        </div>

        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: pageColorTokens.textSecondary,
              marginBottom: 6,
            }}
          >
            描述
          </div>
          {props.editable ? (
            <textarea
              value={props.description}
              onChange={(e) => props.onDescriptionChange?.(e.currentTarget.value)}
              disabled={props.disabled}
              rows={props.descriptionRows ?? 10}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "0.7rem 0.75rem",
                borderRadius: pageColorTokens.radiusControl,
                border: `1px solid ${pageColorTokens.borderInput}`,
                fontSize: 13,
                fontFamily: "inherit",
                lineHeight: 1.6,
                color: pageColorTokens.textBody,
                background: "#fff",
                resize: "vertical",
              }}
            />
          ) : (
            <div
              style={{
                border: `1px solid ${pageColorTokens.borderSubtle}`,
                borderRadius: pageColorTokens.radiusControl,
                padding: "0.7rem 0.8rem",
                fontSize: 13,
                lineHeight: 1.6,
                color: pageColorTokens.textBody,
                background: "#fff",
                minHeight: 170,
                boxSizing: "border-box",
                whiteSpace: "pre-wrap",
              }}
            >
              {props.description || "（无原始描述）"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProductImproveTaskCard({
  task,
  locationSearch,
  onDelete,
  onTaskUpdated,
  deleting,
}: Props) {
  const [localStatus, setLocalStatus] = useState<AITaskStatus>(task.status);
  const [localResult, setLocalResult] = useState<Record<string, unknown> | null>(task.result);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [reviewScore, setReviewScore] = useState(4);
  const [reviewNote, setReviewNote] = useState("");
  const [optimizationComment, setOptimizationComment] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const cfg = task.config as Partial<ProductImproveTaskConfig>;
  const result = localResult as Partial<ProductImproveTaskResult> | null;
  const shortId = task.id.slice(0, 8).toUpperCase();
  const actualElapsed = formatActualElapsed(task.startedAt, task.completedAt);

  useEffect(() => {
    setLocalStatus(task.status);
  }, [task.status]);

  useEffect(() => {
    setLocalResult(task.result);
  }, [task.result]);

  useEffect(() => {
    if (reviewOpen) return;
    setDraftTitle((task.result as Partial<ProductImproveTaskResult> | null)?.title ?? "");
    setDraftDescription(
      (task.result as Partial<ProductImproveTaskResult> | null)?.description ?? "",
    );
    setReviewScore(
      (task.result as Partial<ProductImproveTaskResult> | null)?.reviewScore ?? 4,
    );
    setReviewNote(
      (task.result as Partial<ProductImproveTaskResult> | null)?.reviewNote ?? "",
    );
    setOptimizationComment(
      (task.result as Partial<ProductImproveTaskResult> | null)?.optimizationComment ?? "",
    );
  }, [reviewOpen, task.result]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (reviewOpen) {
      if (!el.open) {
        el.showModal();
      }
    } else if (el.open) {
      el.close();
    }
  }, [reviewOpen]);

  const handleStatusChange = useCallback(
    (status: AITaskStatus, r?: Record<string, unknown>) => {
      setLocalStatus(status);
      if (r) setLocalResult(r);
      onTaskUpdated?.(task.id, status, r);
    },
    [onTaskUpdated, task.id],
  );

  function buildReviewedResult(): ProductImproveTaskResult {
    return {
      title: draftTitle.trim(),
      description: draftDescription.trim(),
      reviewScore,
      reviewNote: reviewNote.trim() || undefined,
      optimizationComment: optimizationComment.trim() || undefined,
    };
  }

  function openReviewDialog() {
    setDraftTitle(result?.title ?? "");
    setDraftDescription(result?.description ?? "");
    setReviewScore(result?.reviewScore ?? 4);
    setReviewNote(result?.reviewNote ?? "");
    setOptimizationComment(result?.optimizationComment ?? "");
    setReviewError(null);
    setRefineError(null);
    setApplyError(null);
    setReviewOpen(true);
  }

  async function handleSaveScore() {
    const reviewedResult = buildReviewedResult();
    if (!reviewedResult.title || !reviewedResult.description) {
      setReviewError("请先补充审核后的标题和描述");
      return;
    }
    setReviewSaving(true);
    setReviewError(null);
    try {
      const resp = await fetch(`/api/ai-task${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "score",
          taskId: task.id,
          result: reviewedResult,
        }),
      });
      const body = (await resp.json()) as { success: boolean; errorMsg?: string };
      if (!body.success) {
        setReviewError(body.errorMsg ?? "保存评分失败");
        return;
      }
      setLocalResult(reviewedResult);
      handleStatusChange("scored", reviewedResult);
      setReviewOpen(false);
    } catch {
      setReviewError("保存评分时发生网络错误");
    } finally {
      setReviewSaving(false);
    }
  }

  async function handleApply() {
    const reviewedResult = buildReviewedResult();
    if (!reviewedResult.title || !reviewedResult.description) {
      setApplyError("请先完成审核并确认标题与描述");
      return;
    }
    setApplying(true);
    setApplyError(null);
    try {
      const updateResp = await fetch(`/api/update-product-description${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: cfg.productId,
          title: reviewedResult.title,
          descriptionPlain: reviewedResult.description,
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
        body: JSON.stringify({
          action: "apply",
          taskId: task.id,
          result: reviewedResult,
        }),
      });
      setLocalResult(reviewedResult);
      handleStatusChange("applied", reviewedResult);
      setReviewOpen(false);
    } catch {
      setApplyError("应用时发生网络错误");
    } finally {
      setApplying(false);
    }
  }

  async function handleRefine() {
    if (!draftTitle.trim() || !draftDescription.trim()) {
      setRefineError("请先补充当前草稿标题和描述");
      return;
    }
    if (!optimizationComment.trim()) {
      setRefineError("请填写希望 AI 继续优化的方向或评论");
      return;
    }

    setRefining(true);
    setRefineError(null);
    setReviewError(null);
    setApplyError(null);

    try {
      const resp = await fetch(`/api/ai-task${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "refine",
          taskId: task.id,
          draftTitle,
          draftDescription,
          optimizationComment,
        }),
      });
      const body = (await resp.json()) as {
        success: boolean;
        errorMsg?: string;
        result?: ProductImproveTaskResult;
      };
      if (!body.success || !body.result) {
        setRefineError(body.errorMsg ?? "继续 AI 优化失败");
        return;
      }
      setDraftTitle(body.result.title ?? "");
      setDraftDescription(body.result.description ?? "");
      setReviewScore(4);
      setLocalResult(body.result);
      handleStatusChange("pending_review", body.result);
    } catch {
      setRefineError("继续 AI 优化时发生网络错误");
    } finally {
      setRefining(false);
    }
  }

  return (
    <div
      style={{
        border: `1px solid ${pageColorTokens.border}`,
        borderRadius: pageColorTokens.radiusCard,
        padding: "14px 16px",
        background: "linear-gradient(160deg, #ffffff 0%, #fafbfd 100%)",
        boxShadow: pageColorTokens.shadowCard,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 12,
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

          {/* Meta line */}
          <div
            style={{
              fontSize: 12,
              color: pageColorTokens.textSecondary,
              display: "flex",
              gap: 4,
              flexWrap: "wrap",
            }}
          >
            <span>商品文案</span>
            <span style={{ color: pageColorTokens.textFootnote }}>·</span>
            <span>创建于 {formatTaskDate(task.createdAt)}</span>
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
          {cfg.productId && (
            <div style={{ fontSize: 12, color: pageColorTokens.textSecondary, marginTop: 4 }}>
              目标商品 ID: {cfg.productId}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onDelete(task.id)}
          disabled={deleting}
          style={{
            cursor: deleting ? "default" : "pointer",
            color: deleting ? pageColorTokens.textFootnote : pageColorTokens.critical,
            fontSize: 13,
            padding: "6px 10px",
            borderRadius: pageColorTokens.radiusControl,
            border: `1px solid ${pageColorTokens.borderSubtle}`,
            background: pageColorTokens.surface,
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

      {(localStatus === "pending_review" ||
        localStatus === "scored" ||
        localStatus === "applied") &&
        result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <ReviewContentPanel
              label="原始内容"
              title={cfg.originalTitle ?? ""}
              description={cfg.originalText ?? ""}
            />
            <ReviewContentPanel
              label="当前结果"
              tone="positive"
              title={String(result.title ?? "")}
              description={String(result.description ?? "")}
            />
          </div>

          {(result.reviewScore || result.reviewNote || result.optimizationComment) && (
            <div
              style={{
                border: `1px solid ${pageColorTokens.borderSubtle}`,
                borderRadius: pageColorTokens.radiusControl,
                background: pageColorTokens.surfaceSubtle,
                padding: "10px 12px",
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                fontSize: 12,
                color: pageColorTokens.textSecondary,
              }}
            >
              {result.reviewScore ? <span>人工评分 {result.reviewScore}/5</span> : null}
              {result.reviewNote ? <span>审核备注：{result.reviewNote}</span> : null}
              {result.optimizationComment ? (
                <span>AI 优化说明：{result.optimizationComment}</span>
              ) : null}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            {localStatus !== "applied" ? (
              <>
                <button
                  type="button"
                  onClick={openReviewDialog}
                  style={{
                    padding: "8px 16px",
                    borderRadius: pageColorTokens.radiusControl,
                    background: pageColorTokens.surface,
                    color: pageColorTokens.textBody,
                    border: `1px solid ${pageColorTokens.borderSubtle}`,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {localStatus === "pending_review" ? "进入审核" : "继续审核"}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(task.id)}
                  disabled={deleting}
                  style={{
                    padding: "8px 16px",
                    borderRadius: pageColorTokens.radiusControl,
                    background: pageColorTokens.surfaceSubtle,
                    color: pageColorTokens.textBody,
                    border: `1px solid ${pageColorTokens.borderSubtle}`,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  丢弃
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={openReviewDialog}
                style={{
                  padding: "8px 16px",
                  borderRadius: pageColorTokens.radiusControl,
                  background: pageColorTokens.surface,
                  color: pageColorTokens.textBody,
                  border: `1px solid ${pageColorTokens.borderSubtle}`,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                查看审核记录
              </button>
            )}
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
            borderRadius: pageColorTokens.radiusControl,
            fontSize: 13,
            color: pageColorTokens.brandGreenDark,
            fontWeight: 500,
            border: "1px solid rgba(0, 166, 124, 0.18)",
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

      <dialog
        ref={dialogRef}
        onCancel={(e) => {
          e.preventDefault();
          if (!reviewSaving && !refining && !applying) {
            setReviewOpen(false);
          }
        }}
        style={{
          maxWidth: "760px",
          width: "calc(100% - 2rem)",
          padding: 0,
          border: "none",
          borderRadius: "14px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
        }}
      >
        <div style={{ padding: "1.125rem 1.25rem", display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div
              style={{
                fontSize: "1rem",
                fontWeight: 700,
                color: pageColorTokens.textPrimary,
                marginBottom: "0.3rem",
              }}
            >
              审核商品文案结果
            </div>
            <div style={{ fontSize: 13, color: pageColorTokens.textSecondary, lineHeight: 1.5 }}>
              审核通过前不会写入 Shopify。你可以先人工改稿、写评论让 AI 继续优化，再保存评分或决定是否应用。
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <ReviewContentPanel
              label="原始内容"
              title={cfg.originalTitle ?? ""}
              description={cfg.originalText ?? ""}
            />
            <ReviewContentPanel
              label="审核草稿"
              tone="positive"
              title={draftTitle}
              description={draftDescription}
              editable
              disabled={reviewSaving || refining || applying || localStatus === "applied"}
              onTitleChange={setDraftTitle}
              onDescriptionChange={setDraftDescription}
              descriptionRows={10}
            />
          </div>

          <div
            style={{
              border: `1px solid ${pageColorTokens.borderSubtle}`,
              borderRadius: pageColorTokens.radiusControl,
              padding: "0.9rem 1rem",
              background: pageColorTokens.surfaceSubtle,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: pageColorTokens.textPrimary, marginBottom: 8 }}>
              人工评分
            </div>
            <div style={{ fontSize: 12, color: pageColorTokens.textSecondary, marginBottom: 10 }}>
              人工评分用于记录当前草稿质量；如果继续让 AI 改写，建议在新结果生成后重新评分。
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              {[1, 2, 3, 4, 5].map((score) => {
                const active = reviewScore === score;
                return (
                  <button
                    key={score}
                    type="button"
                    onClick={() => setReviewScore(score)}
                    disabled={reviewSaving || refining || applying || localStatus === "applied"}
                    style={{
                      padding: "0.45rem 0.8rem",
                      borderRadius: 999,
                      border: `1px solid ${active ? pageColorTokens.brandGreen : pageColorTokens.borderSubtle}`,
                      background: active ? pageColorTokens.brandGreenLight : pageColorTokens.surface,
                      color: active ? pageColorTokens.brandGreenDark : pageColorTokens.textBody,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {score}/5
                  </button>
                );
              })}
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: pageColorTokens.textBody, marginBottom: 4 }}>
                审核备注
              </label>
              <textarea
                value={reviewNote}
                onChange={(e) => setReviewNote(e.currentTarget.value)}
                disabled={reviewSaving || refining || applying || localStatus === "applied"}
                rows={3}
                placeholder="可记录修改原因、语气问题或后续优化建议"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "0.55rem 0.65rem",
                  borderRadius: pageColorTokens.radiusControl,
                  border: `1px solid ${pageColorTokens.borderInput}`,
                  fontSize: 13,
                  fontFamily: "inherit",
                  lineHeight: 1.55,
                  resize: "vertical",
                }}
              />
            </div>
          </div>

          {localStatus !== "applied" ? (
            <div
              style={{
                border: `1px solid ${pageColorTokens.borderSubtle}`,
                borderRadius: pageColorTokens.radiusControl,
                padding: "0.9rem 1rem",
                background: "#fbfcff",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: pageColorTokens.textPrimary, marginBottom: 8 }}>
                继续 AI 优化
              </div>
              <div style={{ fontSize: 12, color: pageColorTokens.textSecondary, marginBottom: 10, lineHeight: 1.55 }}>
                输入你希望 AI 继续优化的方向，例如语气更简洁、突出材质卖点、保留你刚刚手动改过的结构等。AI 会基于当前草稿继续改写。
              </div>
              <textarea
                value={optimizationComment}
                onChange={(e) => setOptimizationComment(e.currentTarget.value)}
                disabled={reviewSaving || refining || applying}
                rows={4}
                placeholder="例如：保留当前第一段结构，把语气改得更高级一些，并补充适用场景。"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "0.65rem 0.75rem",
                  borderRadius: pageColorTokens.radiusControl,
                  border: `1px solid ${pageColorTokens.borderInput}`,
                  fontSize: 13,
                  fontFamily: "inherit",
                  lineHeight: 1.55,
                  resize: "vertical",
                  background: "#fff",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => void handleRefine()}
                  disabled={reviewSaving || refining || applying}
                  style={{
                    padding: "8px 16px",
                    borderRadius: pageColorTokens.radiusControl,
                    background: refining ? pageColorTokens.surfaceMuted : pageColorTokens.surface,
                    color: refining ? pageColorTokens.textSecondary : pageColorTokens.textBody,
                    border: `1px solid ${pageColorTokens.borderSubtle}`,
                    cursor: refining ? "default" : "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {refining ? "AI 优化中..." : "提交 AI 继续优化"}
                </button>
              </div>
            </div>
          ) : null}

          {reviewError ? (
            <div
              style={{
                fontSize: 12,
                color: pageColorTokens.criticalText,
                background: pageColorTokens.criticalBg,
                padding: "8px 10px",
                borderRadius: pageColorTokens.radiusControl,
                border: "1px solid rgba(220, 38, 38, 0.15)",
              }}
            >
              {reviewError}
            </div>
          ) : null}

          {refineError ? (
            <div
              style={{
                fontSize: 12,
                color: pageColorTokens.criticalText,
                background: pageColorTokens.criticalBg,
                padding: "8px 10px",
                borderRadius: pageColorTokens.radiusControl,
                border: "1px solid rgba(220, 38, 38, 0.15)",
              }}
            >
              {refineError}
            </div>
          ) : null}

          {applyError ? (
            <div
              style={{
                fontSize: 12,
                color: pageColorTokens.criticalText,
                background: pageColorTokens.criticalBg,
                padding: "8px 10px",
                borderRadius: pageColorTokens.radiusControl,
                border: "1px solid rgba(220, 38, 38, 0.15)",
              }}
            >
              {applyError}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setReviewOpen(false)}
              disabled={reviewSaving || refining || applying}
              style={{
                padding: "8px 16px",
                borderRadius: pageColorTokens.radiusControl,
                background: pageColorTokens.surface,
                color: pageColorTokens.textBody,
                border: `1px solid ${pageColorTokens.borderSubtle}`,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              关闭
            </button>
            {localStatus !== "applied" ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleSaveScore()}
                  disabled={reviewSaving || refining || applying}
                  style={{
                    padding: "8px 16px",
                    borderRadius: pageColorTokens.radiusControl,
                    background: pageColorTokens.surfaceSubtle,
                    color: pageColorTokens.textBody,
                    border: `1px solid ${pageColorTokens.borderSubtle}`,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {reviewSaving ? "保存中..." : "保存评分"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleApply()}
                  disabled={reviewSaving || refining || applying}
                  style={{
                    padding: "8px 16px",
                    borderRadius: pageColorTokens.radiusControl,
                    background: applying ? pageColorTokens.surfaceMuted : pageColorTokens.brandGreen,
                    color: applying ? pageColorTokens.textSecondary : "#fff",
                    border: "none",
                    cursor: applying ? "default" : "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {applying ? "应用中..." : "确认并写入 Shopify"}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </dialog>

      {/* Failed */}
      {localStatus === "failed" && task.errorMsg && (
        <div
          style={{
            fontSize: 12,
            color: pageColorTokens.criticalText,
            background: pageColorTokens.criticalBg,
            padding: "8px 10px",
            borderRadius: pageColorTokens.radiusControl,
            border: "1px solid rgba(220, 38, 38, 0.15)",
          }}
        >
          {task.errorMsg}
        </div>
      )}
    </div>
  );
}
