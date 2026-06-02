import { useCallback, useEffect, useState } from "react";
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

function CompactMetaItem(props: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <span style={{ fontSize: 11, color: pageColorTokens.textSecondary, fontWeight: 600 }}>
        {props.label}
      </span>
      <span
        style={{
          fontSize: 13,
          color: pageColorTokens.textPrimary,
          fontWeight: 600,
          marginLeft: 8,
          wordBreak: "break-word",
        }}
      >
        {props.value}
      </span>
    </div>
  );
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

  const cfg = task.config as Partial<ProductImproveTaskConfig>;
  const result = localResult as Partial<ProductImproveTaskResult> | null;
  const actualElapsed = formatActualElapsed(task.startedAt, task.completedAt);

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
      setReviewScore(body.result.reviewScore ?? reviewScore);
      setLocalResult(body.result);
      handleStatusChange("pending_review", body.result);
    } catch {
      setRefineError("继续 AI 优化时发生网络错误");
    } finally {
      setRefining(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          paddingBottom: 4,
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 28rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={onBack}
              style={{
                padding: "0.35rem 0.7rem",
                borderRadius: pageColorTokens.radiusControl,
                border: `1px solid ${pageColorTokens.borderSubtle}`,
                background: pageColorTokens.surface,
                color: pageColorTokens.textBody,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              返回任务列表
            </button>
            <div
              style={{
                fontSize: 17,
                fontWeight: 700,
                color: pageColorTokens.textPrimary,
                minWidth: 0,
              }}
            >
              审核任务 #{task.id.slice(0, 8).toUpperCase()}
            </div>
          </div>
          <div
            style={{
              fontSize: 12,
              color: pageColorTokens.textSecondary,
              marginTop: 6,
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <span>商品：{cfg.originalTitle || "未命名商品"}</span>
            <span style={{ color: pageColorTokens.textFootnote }}>·</span>
            <span>在这里集中查看原文、结果、人工评分、AI 继续优化和最终应用动作</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: pageColorTokens.textSecondary, fontWeight: 600 }}>
            当前状态
          </span>
          <TaskStatusBadge status={localStatus} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 2 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: pageColorTokens.textPrimary }}>
            任务摘要
          </div>
          <div style={{ fontSize: 12, color: pageColorTokens.textSecondary, marginTop: 4 }}>
            先确认当前任务目标、时间与消耗，再进入内容审核。
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "8px 18px",
          }}
        >
          <CompactMetaItem label="任务 ID" value={`#${task.id.slice(0, 8).toUpperCase()}`} />
          <CompactMetaItem label="创建时间" value={formatTaskDate(task.createdAt)} />
          <CompactMetaItem label="目标语言" value={cfg.targetLanguage ?? "-"} />
          <CompactMetaItem
            label="预估积分"
            value={task.estimatedCredits ? `${task.estimatedCredits}` : "-"}
          />
          <CompactMetaItem label="实际耗时" value={actualElapsed ?? "-"} />
          <CompactMetaItem label="目标商品" value={cfg.productId ?? "-"} />
        </div>
        <div
          style={{
            height: 1,
            background: pageColorTokens.borderSubtle,
            opacity: 0.8,
          }}
        />
      </div>

      <SectionShell title="内容审核" description="左侧查看原始内容，右侧直接编辑当前审核草稿。">
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
            disabled={refining || applying || localStatus === "applied"}
            onTitleChange={setDraftTitle}
            onDescriptionChange={setDraftDescription}
            descriptionRows={10}
          />
        </div>
      </SectionShell>

      <SectionShell title="审核备注" description="评分是可选信息，备注会随应用或后续 AI 优化一起提交。">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>可选评分</span>
          {[1, 2, 3, 4, 5].map((score) => {
            const active = reviewScore === score;
            return (
              <button
                key={score}
                type="button"
                onClick={() => setReviewScore((prev) => (prev === score ? null : score))}
                disabled={refining || applying || localStatus === "applied"}
                style={{
                  padding: "0.3rem 0.6rem",
                  borderRadius: 999,
                  border: `1px solid ${active ? pageColorTokens.brandGreen : pageColorTokens.borderSubtle}`,
                  background: active ? pageColorTokens.brandGreenLight : "transparent",
                  color: active ? pageColorTokens.brandGreenDark : pageColorTokens.textSecondary,
                  fontSize: 11,
                  fontWeight: active ? 700 : 600,
                  cursor: "pointer",
                }}
              >
                {score}/5
              </button>
            );
          })}
          {reviewScore !== null ? (
            <button
              type="button"
              onClick={() => setReviewScore(null)}
              disabled={refining || applying || localStatus === "applied"}
              style={{
                padding: "0.3rem 0.5rem",
                borderRadius: 999,
                border: "none",
                background: "transparent",
                color: pageColorTokens.textSecondary,
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              清除
            </button>
          ) : null}
        </div>
        <textarea
          value={reviewNote}
          onChange={(e) => setReviewNote(e.currentTarget.value)}
          disabled={refining || applying || localStatus === "applied"}
          rows={3}
          placeholder="填写您对本次 AI 的效果评价"
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
      </SectionShell>

      {localStatus !== "applied" ? (
        <SectionShell title="继续 AI 优化" description="输入新的优化意见，基于当前草稿继续迭代。">
          <textarea
            value={optimizationComment}
            onChange={(e) => setOptimizationComment(e.currentTarget.value)}
            disabled={refining || applying}
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
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => void handleRefine()}
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
        </SectionShell>
      ) : null}

      {result && (result.reviewScore || result.reviewNote || result.optimizationComment) ? (
        <SectionShell title="审核记录" description="沉淀本次任务的人工判断和 AI 继续优化说明。">
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              fontSize: 12,
              color: pageColorTokens.textSecondary,
            }}
          >
            {result.reviewScore ? <span>人工评分 {result.reviewScore}/5</span> : null}
            {result.reviewNote ? <span>审核备注：{result.reviewNote}</span> : null}
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

      <SectionShell
        title="应用动作"
        description={
          localStatus === "applied"
            ? "该任务已完成写入，可返回列表继续处理其他任务。"
            : "确认内容后，可将当前审核草稿应用到 Shopify。评分和备注会一并保留。"
        }
      >
        {localStatus === "applied" ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
              fontWeight: 600,
            }}
          >
            {applying ? "应用中..." : "确认并写入 Shopify"}
          </button>
        </div>
      </SectionShell>
    </div>
  );
}
