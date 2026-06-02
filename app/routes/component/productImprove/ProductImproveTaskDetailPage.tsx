import { useCallback, useEffect, useRef, useState } from "react";
import { pageColorTokens } from "../../page/pageUiStyles";
import { TaskStatusBadge } from "../aiTask/TaskStatusBadge";
import type {
  AITaskItem,
  AITaskStatus,
  ProductImproveTaskConfig,
  ProductImproveTaskResult,
} from "../../../lib/aiTaskTypes";

type Props = {
  task: AITaskItem;
  locationSearch: string;
  onBack: () => void;
  onTaskUpdated?: (taskId: string, status: AITaskStatus, result?: Record<string, unknown>) => void;
};

function getProductAdminUrl(locationSearch: string, productId: string): string | null {
  const params = new URLSearchParams(
    locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch,
  );
  const shop = params.get("shop");
  if (!shop) return null;
  // 从 GID 或纯数字中提取商品 ID
  const idMatch = productId.match(/(?:Product\/)?(\d+)$/);
  const numericId = idMatch?.[1] ?? productId;
  return `https://admin.shopify.com/store/${shop.replace(/\.myshopify\.com$/, "")}/products/${numericId}`;
}

function formatTaskDate(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatActualElapsed(startedAt: string | null, completedAt: string | null): string | null {
  if (!startedAt || !completedAt) return null;
  const elapsedMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const s = Math.floor(elapsedMs / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function SectionShell(props: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        border: `1px solid ${pageColorTokens.borderSubtle}`,
        borderRadius: pageColorTokens.radiusCard,
        background: "#fff",
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: pageColorTokens.textPrimary }}>
          {props.title}
        </div>
        {props.description ? (
          <div style={{ fontSize: 12, color: pageColorTokens.textSecondary, marginTop: 4 }}>
            {props.description}
          </div>
        ) : null}
      </div>
      {props.children}
    </section>
  );
}

function formatVariableToken(name: string): string {
  return `{{${name}}}`;
}

function readStringField(source: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumberField(source: Record<string, unknown> | null | undefined, key: string): number | null {
  const value = source?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatDisplayValue(value: string | number | null | undefined, variableName: string): string {
  if (value == null || value === "") return formatVariableToken(variableName);
  return String(value);
}

function ReviewContentPanel(props: {
  label: string;
  tone?: "neutral" | "positive";
  title: string;
  description: string;
  highlighted?: boolean;
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
        border: `1px solid ${props.highlighted ? pageColorTokens.brandGreen : borderColor}`,
        borderRadius: pageColorTokens.radiusControl,
        background: tone === "positive" ? "#fcfffd" : pageColorTokens.surfaceSubtle,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: props.highlighted
          ? `0 0 0 1px ${pageColorTokens.brandGreen}, 0 8px 24px ${pageColorTokens.brandGreenGlow}`
          : "none",
        transition: "border-color 0.2s ease, box-shadow 0.2s ease",
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

export function ProductImproveTaskDetailPage({
  task,
  locationSearch,
  onBack,
  onTaskUpdated,
}: Props) {
  const [localStatus, setLocalStatus] = useState<AITaskStatus>(task.status);
  const [localResult, setLocalResult] = useState<Record<string, unknown> | null>(task.result);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [reviewScore, setReviewScore] = useState<number | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [optimizationComment, setOptimizationComment] = useState("");
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [refineSuccess, setRefineSuccess] = useState<string | null>(null);
  const [draftHighlight, setDraftHighlight] = useState(false);
  const [scoreDialogOpen, setScoreDialogOpen] = useState(false);
  const [refineDialogOpen, setRefineDialogOpen] = useState(false);

  const cfg = task.config as Partial<ProductImproveTaskConfig>;
  const extendedConfig = task.config as Record<string, unknown>;
  const result = localResult as Partial<ProductImproveTaskResult> | null;
  const actualElapsed = formatActualElapsed(task.startedAt, task.completedAt);
  const shortId = task.id.slice(0, 8).toUpperCase();
  const summaryDescription =
    localStatus === "applied"
      ? "已完成审核与写入，可直接查看结果并返回任务列表。"
      : "在这里集中查看原文、审核草稿、评分备注和最终应用动作。";
  const itemCount = formatDisplayValue(
    readNumberField(extendedConfig, "itemCount"),
    "itemCount",
  );
  const sourceLanguage = formatDisplayValue(
    readStringField(extendedConfig, "sourceLanguage"),
    "sourceLanguage",
  );
  const brandStyle = formatDisplayValue(
    readStringField(extendedConfig, "brandStyle"),
    "brandStyle",
  );
  const productLabel = cfg.originalTitle || "Manual Juicer, Small Household Juicer, Squeeze...";
  const scoreDialogRef = useRef<HTMLDialogElement | null>(null);
  const refineDialogRef = useRef<HTMLDialogElement | null>(null);
  const editingLocked = refining || applying || localStatus === "applied";

  useEffect(() => {
    const el = scoreDialogRef.current;
    if (!el) return;
    if (scoreDialogOpen) {
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [scoreDialogOpen]);

  useEffect(() => {
    const el = refineDialogRef.current;
    if (!el) return;
    if (refineDialogOpen) {
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [refineDialogOpen]);

  useEffect(() => {
    setLocalStatus(task.status);
  }, [task.status]);

  useEffect(() => {
    setLocalResult(task.result);
    const next = task.result as Partial<ProductImproveTaskResult> | null;
    setDraftTitle(next?.title ?? "");
    setDraftDescription(next?.description ?? "");
    setReviewScore(next?.reviewScore ?? null);
    setReviewNote(next?.reviewNote ?? "");
    setOptimizationComment(next?.optimizationComment ?? "");
  }, [task.result]);

  useEffect(() => {
    if (!draftHighlight) return;
    const timer = window.setTimeout(() => setDraftHighlight(false), 2600);
    return () => window.clearTimeout(timer);
  }, [draftHighlight]);

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
      reviewScore: reviewScore ?? undefined,
      reviewNote: reviewNote.trim() || undefined,
      optimizationComment: optimizationComment.trim() || undefined,
    };
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
    } catch {
      setApplyError("应用时发生网络错误");
    } finally {
      setApplying(false);
    }
  }

  async function handleRefine(): Promise<boolean> {
    if (!draftTitle.trim() || !draftDescription.trim()) {
      setRefineError("请先补充当前草稿标题和描述");
      return false;
    }
    if (!optimizationComment.trim()) {
      setRefineError("请填写希望 AI 继续优化的方向或评论");
      return false;
    }

    setRefining(true);
    setRefineError(null);
    setRefineSuccess(null);
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
        return false;
      }
      setDraftTitle(body.result.title ?? "");
      setDraftDescription(body.result.description ?? "");
      setReviewScore(body.result.reviewScore ?? reviewScore);
      setLocalResult(body.result);
      setOptimizationComment(body.result.optimizationComment ?? optimizationComment);
      setDraftHighlight(true);
      setRefineSuccess("AI 已根据最新优化意见更新右侧审核草稿。");
      handleStatusChange("pending_review", body.result);
      return true;
    } catch {
      setRefineError("继续 AI 优化时发生网络错误");
      return false;
    } finally {
      setRefining(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          border: `1px solid ${pageColorTokens.borderSubtle}`,
          borderRadius: pageColorTokens.radiusCard,
          background: "linear-gradient(160deg, #ffffff 0%, #fafbfc 100%)",
          boxShadow: pageColorTokens.shadowCard,
          padding: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0, flex: "1 1 28rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 10,
              }}
            >
              <button
                type="button"
                onClick={onBack}
                style={{
                  padding: "0.35rem 0.7rem",
                  borderRadius: pageColorTokens.radiusControl,
                  border: `1px solid ${pageColorTokens.borderSubtle}`,
                  background: "#ffffff",
                  color: pageColorTokens.textBody,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                返回任务列表
              </button>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: pageColorTokens.textSecondary,
                  padding: "0.22rem 0.48rem",
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
                fontSize: 18,
                fontWeight: 700,
                color: pageColorTokens.textPrimary,
                lineHeight: 1.3,
              }}
            >
              任务摘要
            </div>
            <div
              style={{
                fontSize: 13,
                color: pageColorTokens.textSecondary,
                marginTop: 6,
                lineHeight: 1.55,
                maxWidth: "52rem",
              }}
            >
              {summaryDescription}
            </div>
          </div>
          <div
            style={{
              flexShrink: 0,
              alignSelf: "center",
              fontSize: 12,
              color: pageColorTokens.textFootnote,
              fontWeight: 600,
            }}
          >
            创建时间：{formatTaskDate(task.createdAt)}
          </div>
        </div>

        <div
          style={{
            padding: "0.95rem 1rem",
            borderRadius: pageColorTokens.radiusControl,
            background: "#ffffff",
            border: `1px solid ${pageColorTokens.borderSubtle}`,
            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.03)",
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            alignItems: "center",
            fontSize: 13,
            lineHeight: 1.6,
            color: pageColorTokens.textSecondary,
          }}
        >
          <span>任务详情：</span>
          <span>{itemCount} 个商品</span>
          <span style={{ color: pageColorTokens.textFootnote }}>|</span>
          <span>输出 {cfg.targetLanguage ?? "zh-CN"}</span>
          <span style={{ color: pageColorTokens.textFootnote }}>|</span>
          <span>语言：{sourceLanguage}</span>
          <span style={{ color: pageColorTokens.textFootnote }}>|</span>
          <span>品牌风格：{brandStyle}</span>
          <span style={{ color: pageColorTokens.textFootnote }}>|</span>
          <span
            style={{
              minWidth: 0,
              maxWidth: "min(100%, 420px)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "inline-block",
              verticalAlign: "bottom",
              color: pageColorTokens.textPrimary,
            }}
            title={productLabel}
          >
            商品：{productLabel}
          </span>
        </div>
      </div>

      <SectionShell title="内容审核" description="左侧查看原始内容，右侧直接编辑当前草稿。评分与 AI 优化收纳到辅助弹窗中。">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {reviewScore !== null ? (
              <span
                style={{
                  padding: "0.28rem 0.65rem",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  color: pageColorTokens.brandGreenDark,
                  background: pageColorTokens.brandGreenLight,
                  border: "1px solid rgba(0, 166, 124, 0.16)",
                }}
              >
                结果评分 {reviewScore}/5
              </span>
            ) : (
              <span style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
                结果评分尚未填写
              </span>
            )}
            {reviewNote.trim() ? (
              <span style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
                已添加评分说明
              </span>
            ) : null}
            {optimizationComment.trim() ? (
              <span style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
                已保存 AI 优化提示
              </span>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setScoreDialogOpen(true)}
              disabled={editingLocked}
              style={{
                padding: "8px 14px",
                borderRadius: pageColorTokens.radiusControl,
                background: "#ffffff",
                color: editingLocked ? pageColorTokens.textFootnote : pageColorTokens.textBody,
                border: `1px solid ${pageColorTokens.borderSubtle}`,
                cursor: editingLocked ? "default" : "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              结果评分
            </button>
            {localStatus !== "applied" ? (
              <button
                type="button"
                onClick={() => setRefineDialogOpen(true)}
                disabled={refining || applying}
                style={{
                  padding: "8px 14px",
                  borderRadius: pageColorTokens.radiusControl,
                  background: "#ffffff",
                  color: refining || applying ? pageColorTokens.textFootnote : pageColorTokens.textBody,
                  border: `1px solid ${pageColorTokens.borderSubtle}`,
                  cursor: refining || applying ? "default" : "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                继续 AI 优化
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={refining || applying || localStatus === "applied"}
              style={{
                padding: "8px 16px",
                borderRadius: pageColorTokens.radiusControl,
                background: applying ? pageColorTokens.surfaceMuted : pageColorTokens.brandGreen,
                color: applying ? pageColorTokens.textSecondary : "#fff",
                border: "none",
                cursor: applying ? "default" : "pointer",
                fontSize: 13,
                fontWeight: 700,
                boxShadow: applying ? "none" : "0 6px 18px rgba(0, 166, 124, 0.18)",
              }}
            >
              {applying ? "应用中..." : "确认并写入 Shopify"}
            </button>
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
            highlighted={draftHighlight}
            editable
            disabled={editingLocked}
            onTitleChange={setDraftTitle}
            onDescriptionChange={setDraftDescription}
            descriptionRows={12}
          />
        </div>

        {refineSuccess ? (
          <div
            style={{
              fontSize: 12,
              color: pageColorTokens.brandGreenDark,
              background: pageColorTokens.brandGreenLight,
              padding: "9px 11px",
              borderRadius: pageColorTokens.radiusControl,
              border: "1px solid rgba(0, 166, 124, 0.18)",
            }}
          >
            {refineSuccess}
          </div>
        ) : null}

        {localStatus === "applied" ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: "10px 12px",
              background: pageColorTokens.brandGreenLight,
              borderRadius: pageColorTokens.radiusControl,
              fontSize: 13,
              color: pageColorTokens.brandGreenDark,
              fontWeight: 500,
              border: "1px solid rgba(0, 166, 124, 0.18)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>✓</span>
              <span>已写入 Shopify</span>
            </div>
            {(() => {
              const url = getProductAdminUrl(locationSearch, cfg.productId ?? "");
              if (!url) return null;
              return (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: pageColorTokens.brandBlue,
                    fontSize: 12,
                    fontWeight: 600,
                    textDecoration: "underline",
                  }}
                >
                  在 Shopify 后台查看商品 →
                </a>
              );
            })()}
          </div>
        ) : null}
      </SectionShell>

      {result && (result.reviewScore || result.reviewNote || result.optimizationComment) ? (
        <SectionShell title="结果评分记录" description="沉淀本次任务的评分结果与 AI 继续优化说明。">
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              fontSize: 12,
              color: pageColorTokens.textSecondary,
            }}
          >
            {result.reviewScore ? <span>结果评分 {result.reviewScore}/5</span> : null}
            {result.reviewNote ? <span>评分说明：{result.reviewNote}</span> : null}
            {result.optimizationComment ? <span>AI 优化说明：{result.optimizationComment}</span> : null}
          </div>
        </SectionShell>
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

      <dialog
        ref={scoreDialogRef}
        onCancel={(e) => {
          e.preventDefault();
          if (!editingLocked) setScoreDialogOpen(false);
        }}
        style={{
          position: "fixed",
          inset: 0,
          margin: "auto",
          maxWidth: "520px",
          width: "calc(100% - 2rem)",
          padding: 0,
          border: "none",
          borderRadius: "12px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
        }}
      >
        <div style={{ padding: "1.125rem 1.25rem", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div
              style={{
                fontSize: "1rem",
                fontWeight: 700,
                color: pageColorTokens.textPrimary,
                marginBottom: "0.35rem",
              }}
            >
              结果评分
            </div>
            <div
              style={{
                fontSize: "0.8125rem",
                color: pageColorTokens.textSecondary,
                lineHeight: 1.5,
              }}
            >
              为当前创建内容打分，并可补充评分说明。
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {[1, 2, 3, 4, 5].map((score) => {
              const active = reviewScore === score;
              return (
                <button
                  key={score}
                  type="button"
                  onClick={() => setReviewScore((prev) => (prev === score ? null : score))}
                  disabled={editingLocked}
                  style={{
                    padding: "0.38rem 0.72rem",
                    borderRadius: 999,
                    border: `1px solid ${active ? pageColorTokens.brandGreen : pageColorTokens.borderSubtle}`,
                    background: active ? pageColorTokens.brandGreenLight : "transparent",
                    color: active ? pageColorTokens.brandGreenDark : pageColorTokens.textSecondary,
                    fontSize: 12,
                    fontWeight: active ? 700 : 600,
                    cursor: "pointer",
                  }}
                >
                  {score}/5
                </button>
              );
            })}
          </div>
          <textarea
            value={reviewNote}
            onChange={(e) => setReviewNote(e.currentTarget.value)}
            disabled={editingLocked}
            rows={4}
            placeholder="可选：填写评分说明，例如文案准确性、品牌语气、可读性等。"
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
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              type="button"
              onClick={() => setScoreDialogOpen(false)}
              style={{
                padding: "8px 14px",
                borderRadius: pageColorTokens.radiusControl,
                background: "#ffffff",
                color: pageColorTokens.textBody,
                border: `1px solid ${pageColorTokens.borderSubtle}`,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              完成
            </button>
          </div>
        </div>
      </dialog>

      <dialog
        ref={refineDialogRef}
        onCancel={(e) => {
          e.preventDefault();
          if (!refining && !applying) setRefineDialogOpen(false);
        }}
        style={{
          position: "fixed",
          inset: 0,
          margin: "auto",
          maxWidth: "560px",
          width: "calc(100% - 2rem)",
          padding: 0,
          border: "none",
          borderRadius: "12px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
        }}
      >
        <div style={{ padding: "1.125rem 1.25rem", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div
              style={{
                fontSize: "1rem",
                fontWeight: 700,
                color: pageColorTokens.textPrimary,
                marginBottom: "0.35rem",
              }}
            >
              继续 AI 优化
            </div>
            <div
              style={{
                fontSize: "0.8125rem",
                color: pageColorTokens.textSecondary,
                lineHeight: 1.5,
              }}
            >
              输入新的优化意见，基于当前草稿继续迭代。
            </div>
          </div>
          <textarea
            value={optimizationComment}
            onChange={(e) => setOptimizationComment(e.currentTarget.value)}
            disabled={refining || applying}
            rows={5}
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
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              type="button"
              onClick={() => setRefineDialogOpen(false)}
              disabled={refining}
              style={{
                padding: "8px 14px",
                borderRadius: pageColorTokens.radiusControl,
                background: "#ffffff",
                color: pageColorTokens.textBody,
                border: `1px solid ${pageColorTokens.borderSubtle}`,
                cursor: refining ? "default" : "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                void handleRefine().then((ok) => {
                  if (ok) setRefineDialogOpen(false);
                });
              }}
              disabled={refining || applying}
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
      </dialog>
    </div>
  );
}
