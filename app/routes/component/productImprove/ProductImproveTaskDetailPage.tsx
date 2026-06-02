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

type ResultRecord = {
  id: string;
  version: number;
  title: string;
  description: string;
  reviewScore: number | null;
  reviewNote: string;
  optimizationComment: string;
  createdAt: string;
  sourceLabel: string;
  statusNote: string | null;
  applied: boolean;
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

function buildTaskResultFromRecord(record: ResultRecord): ProductImproveTaskResult {
  return {
    title: record.title.trim(),
    description: record.description.trim(),
    reviewScore: record.reviewScore ?? undefined,
    reviewNote: record.reviewNote.trim() || undefined,
    optimizationComment: record.optimizationComment.trim() || undefined,
  };
}

function buildInitialResultRecords(task: AITaskItem): ResultRecord[] {
  const result = task.result as Partial<ProductImproveTaskResult> | null;
  return [
    {
      id: `${task.id}-v1`,
      version: 1,
      title: result?.title ?? "",
      description: result?.description ?? "",
      reviewScore: result?.reviewScore ?? null,
      reviewNote: result?.reviewNote ?? "",
      optimizationComment: result?.optimizationComment ?? "",
      createdAt: task.completedAt ?? task.createdAt,
      sourceLabel: "初始生成结果",
      statusNote: null,
      applied: task.status === "applied",
    },
  ];
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
  const sharedFieldStyle = {
    width: "100%",
    boxSizing: "border-box" as const,
    borderRadius: pageColorTokens.radiusControl,
    border: `1px solid ${pageColorTokens.borderSubtle}`,
    background: "#fff",
  };
  const sharedTitleStyle = {
    ...sharedFieldStyle,
    padding: "0.7rem 0.8rem",
    minHeight: 72,
    maxHeight: 72,
    fontSize: 13,
    lineHeight: 1.45,
    color: pageColorTokens.textPrimary,
    fontWeight: 600,
    overflowY: "auto" as const,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    resize: "none" as const,
  };
  const sharedDescriptionStyle = {
    ...sharedFieldStyle,
    padding: "0.75rem 0.8rem",
    minHeight: 320,
    maxHeight: 320,
    fontSize: 13,
    lineHeight: 1.6,
    color: pageColorTokens.textBody,
    overflowY: "auto" as const,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    resize: "none" as const,
  };

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
            <textarea
              value={props.title}
              onChange={(e) => props.onTitleChange?.(e.currentTarget.value)}
              disabled={props.disabled}
              rows={2}
              style={{
                ...sharedTitleStyle,
                border: `1px solid ${pageColorTokens.borderInput}`,
                fontFamily: "inherit",
              }}
            />
          ) : (
            <div
              style={{
                ...sharedTitleStyle,
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
                ...sharedDescriptionStyle,
                border: `1px solid ${pageColorTokens.borderInput}`,
                fontFamily: "inherit",
              }}
            />
          ) : (
            <div
              style={{
                ...sharedDescriptionStyle,
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
  const [resultRecords, setResultRecords] = useState<ResultRecord[]>(() =>
    buildInitialResultRecords(task),
  );
  const [activeRecordId, setActiveRecordId] = useState<string>(() =>
    buildInitialResultRecords(task)[0]?.id ?? "",
  );
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [draftHighlight, setDraftHighlight] = useState(false);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [feedbackRecordId, setFeedbackRecordId] = useState<string | null>(null);
  const [feedbackScore, setFeedbackScore] = useState<number | null>(null);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackOptimizationComment, setFeedbackOptimizationComment] = useState("");

  const cfg = task.config as Partial<ProductImproveTaskConfig>;
  const extendedConfig = task.config as Record<string, unknown>;
  const actualElapsed = formatActualElapsed(task.startedAt, task.completedAt);
  const shortId = task.id.slice(0, 8).toUpperCase();
  const summaryDescription =
    localStatus === "applied"
      ? "已完成审核与写入，可直接查看结果并返回任务列表。"
      : "左侧查看原始内容，右侧以结果记录的方式迭代草稿并选择最终应用版本。";
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
  const feedbackDialogRef = useRef<HTMLDialogElement | null>(null);
  const activeRecord =
    resultRecords.find((record) => record.id === activeRecordId) ?? resultRecords[0] ?? null;
  const editingLocked = refining || applying || localStatus === "applied";

  useEffect(() => {
    const el = feedbackDialogRef.current;
    if (!el) return;
    if (feedbackDialogOpen) {
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [feedbackDialogOpen]);

  useEffect(() => {
    setLocalStatus(task.status);
  }, [task.status]);

  useEffect(() => {
    setLocalResult(task.result);
    const nextRecords = buildInitialResultRecords(task);
    setResultRecords(nextRecords);
    setActiveRecordId(nextRecords[0]?.id ?? "");
  }, [task]);

  useEffect(() => {
    if (!draftHighlight) return;
    const timer = window.setTimeout(() => setDraftHighlight(false), 2600);
    return () => window.clearTimeout(timer);
  }, [draftHighlight]);

  const updateResultRecord = useCallback((recordId: string, patch: Partial<ResultRecord>) => {
    setResultRecords((prev) =>
      prev.map((record) => (record.id === recordId ? { ...record, ...patch } : record)),
    );
  }, []);

  const handleStatusChange = useCallback(
    (status: AITaskStatus, r?: Record<string, unknown>) => {
      setLocalStatus(status);
      if (r) setLocalResult(r);
      onTaskUpdated?.(task.id, status, r);
    },
    [onTaskUpdated, task.id],
  );

  function openFeedbackDialog(record: ResultRecord) {
    setFeedbackRecordId(record.id);
    setFeedbackScore(record.reviewScore);
    setFeedbackNote(record.reviewNote);
    setFeedbackOptimizationComment(record.optimizationComment);
    setFeedbackDialogOpen(true);
  }

  async function handleApply(record: ResultRecord) {
    const reviewedResult = buildTaskResultFromRecord(record);
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
      setResultRecords((prev) =>
        prev.map((item) => ({
          ...item,
          applied: item.id === record.id,
          statusNote: item.id === record.id ? "该版本已被确认为最终写入版本" : item.statusNote,
        })),
      );
      setActiveRecordId(record.id);
      handleStatusChange("applied", reviewedResult);
    } catch {
      setApplyError("应用时发生网络错误");
    } finally {
      setApplying(false);
    }
  }

  async function handleRefine(): Promise<boolean> {
    if (!feedbackRecordId) {
      setRefineError("未找到要继续优化的结果记录");
      return false;
    }

    const sourceRecord = resultRecords.find((record) => record.id === feedbackRecordId);
    if (!sourceRecord) {
      setRefineError("未找到要继续优化的结果记录");
      return false;
    }

    if (!sourceRecord.title.trim() || !sourceRecord.description.trim()) {
      setRefineError("请先补充当前草稿标题和描述");
      return false;
    }
    if (!feedbackOptimizationComment.trim()) {
      setRefineError("请填写希望 AI 继续优化的方向或评论");
      return false;
    }

    setRefining(true);
    setRefineError(null);
    setApplyError(null);

    updateResultRecord(sourceRecord.id, {
      reviewScore: feedbackScore,
      reviewNote: feedbackNote,
      optimizationComment: feedbackOptimizationComment,
    });

    const feedbackSummary = [
      feedbackOptimizationComment.trim(),
      feedbackScore !== null ? `结果评分：${feedbackScore}/5` : null,
      feedbackNote.trim() ? `评价补充：${feedbackNote.trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const resp = await fetch(`/api/ai-task${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "refine",
          taskId: task.id,
          draftTitle: sourceRecord.title,
          draftDescription: sourceRecord.description,
          optimizationComment: feedbackSummary,
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

      const nextVersion =
        resultRecords.reduce((max, record) => Math.max(max, record.version), 0) + 1;
      const newRecord: ResultRecord = {
        id: `${task.id}-v${nextVersion}-${Date.now()}`,
        version: nextVersion,
        title: body.result.title ?? "",
        description: body.result.description ?? "",
        reviewScore: null,
        reviewNote: "",
        optimizationComment: "",
        createdAt: new Date().toISOString(),
        sourceLabel: `基于 V${sourceRecord.version} 的反馈继续优化`,
        statusNote: `由 V${sourceRecord.version} 的评分与优化意见生成`,
        applied: false,
      };

      setResultRecords((prev) =>
        prev
          .map((record) =>
            record.id === sourceRecord.id
              ? {
                  ...record,
                  reviewScore: feedbackScore,
                  reviewNote: feedbackNote,
                  optimizationComment: feedbackOptimizationComment,
                  statusNote: `已基于该记录生成 V${nextVersion}`,
                }
              : record,
          )
          .concat(newRecord),
      );
      setLocalResult(body.result);
      setActiveRecordId(newRecord.id);
      setDraftHighlight(true);
      setFeedbackDialogOpen(false);
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

      <SectionShell
        title="内容审核"
        description="左侧查看原始内容，右侧编辑当前选中的结果版本。评分与 AI 优化收纳到记录级弹窗中。"
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          <ReviewContentPanel
            label="原始内容"
            title={cfg.originalTitle ?? ""}
            description={cfg.originalText ?? ""}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <ReviewContentPanel
              label={activeRecord ? `创建内容 · V${activeRecord.version}` : "创建内容"}
              tone="positive"
              title={activeRecord?.title ?? ""}
              description={activeRecord?.description ?? ""}
              highlighted={draftHighlight}
              editable
              disabled={editingLocked || !activeRecord}
              onTitleChange={(value) => {
                if (!activeRecord) return;
                updateResultRecord(activeRecord.id, { title: value });
              }}
              onDescriptionChange={(value) => {
                if (!activeRecord) return;
                updateResultRecord(activeRecord.id, { description: value });
              }}
              descriptionRows={12}
            />

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => activeRecord && void handleApply(activeRecord)}
                disabled={!activeRecord || refining || applying || localStatus === "applied"}
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
                {applying ? "应用中..." : "应用当前版本"}
              </button>
            </div>
          </div>
        </div>

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

      <SectionShell
        title="结果记录"
        description="每次评分与 AI 优化都会沉淀为一条记录，新的优化结果会在这里继续新增版本。"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {resultRecords.map((record) => {
            const isActive = activeRecord?.id === record.id;
            return (
              <div
                key={record.id}
                style={{
                  border: `1px solid ${
                    isActive ? "rgba(0, 166, 124, 0.28)" : pageColorTokens.borderSubtle
                  }`,
                  borderRadius: pageColorTokens.radiusControl,
                  background: isActive ? "#f8fffc" : "#ffffff",
                  padding: "0.8rem 0.85rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span
                      style={{
                        padding: "0.2rem 0.5rem",
                        borderRadius: 999,
                        background: isActive ? pageColorTokens.brandGreenLight : pageColorTokens.surfaceMuted,
                        color: isActive ? pageColorTokens.brandGreenDark : pageColorTokens.textSecondary,
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      V{record.version}
                    </span>
                    <span style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
                      {record.sourceLabel}
                    </span>
                    {record.applied ? (
                      <span style={{ fontSize: 12, color: pageColorTokens.brandGreenDark, fontWeight: 700 }}>
                        已应用
                      </span>
                    ) : null}
                  </div>
                  <span style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
                    {formatTaskDate(record.createdAt)}
                  </span>
                </div>

                <div style={{ fontSize: 13, fontWeight: 600, color: pageColorTokens.textPrimary }}>
                  {record.title || "（无标题）"}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: pageColorTokens.textSecondary,
                    lineHeight: 1.6,
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {record.description || "（无描述）"}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    fontSize: 12,
                    color: pageColorTokens.textSecondary,
                  }}
                >
                  <span>
                    {record.reviewScore !== null ? `结果评分 ${record.reviewScore}/5` : "结果评分未填写"}
                  </span>
                  <span>
                    {record.reviewNote.trim() ? `评分说明：${record.reviewNote}` : "评分说明未填写"}
                  </span>
                </div>

                {record.statusNote ? (
                  <div style={{ fontSize: 12, color: pageColorTokens.textFootnote, lineHeight: 1.5 }}>
                    {record.statusNote}
                  </div>
                ) : null}

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveRecordId(record.id);
                      openFeedbackDialog(record);
                    }}
                    disabled={editingLocked}
                    style={{
                      padding: "7px 12px",
                      borderRadius: pageColorTokens.radiusControl,
                      background: "#ffffff",
                      color: editingLocked ? pageColorTokens.textFootnote : pageColorTokens.textBody,
                      border: `1px solid ${pageColorTokens.borderSubtle}`,
                      cursor: editingLocked ? "default" : "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    评分并继续优化
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveRecordId(record.id)}
                    style={{
                      padding: "7px 12px",
                      borderRadius: pageColorTokens.radiusControl,
                      background: isActive ? pageColorTokens.brandGreenLight : "#ffffff",
                      color: isActive ? pageColorTokens.brandGreenDark : pageColorTokens.textBody,
                      border: `1px solid ${isActive ? pageColorTokens.brandGreen : pageColorTokens.borderSubtle}`,
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {isActive ? "正在编辑" : "编辑这一版"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleApply(record)}
                    disabled={refining || applying || localStatus === "applied"}
                    style={{
                      padding: "7px 12px",
                      borderRadius: pageColorTokens.radiusControl,
                      background: "#ffffff",
                      color:
                        refining || applying || localStatus === "applied"
                          ? pageColorTokens.textFootnote
                          : pageColorTokens.brandGreenDark,
                      border: `1px solid ${
                        refining || applying || localStatus === "applied"
                          ? pageColorTokens.borderSubtle
                          : "rgba(0, 166, 124, 0.24)"
                      }`,
                      cursor: refining || applying || localStatus === "applied" ? "default" : "pointer",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    应用这一版
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </SectionShell>

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
        ref={feedbackDialogRef}
        onCancel={(e) => {
          e.preventDefault();
          if (!editingLocked) setFeedbackDialogOpen(false);
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
              评分并继续优化
            </div>
            <div
              style={{
                fontSize: "0.8125rem",
                color: pageColorTokens.textSecondary,
                lineHeight: 1.5,
              }}
            >
              对当前结果版本填写评分与评价，再把这些反馈一起交给 AI 生成新的版本记录。
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {[1, 2, 3, 4, 5].map((score) => {
              const active = feedbackScore === score;
              return (
                <button
                  key={score}
                  type="button"
                  onClick={() => setFeedbackScore((prev) => (prev === score ? null : score))}
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
            value={feedbackNote}
            onChange={(e) => setFeedbackNote(e.currentTarget.value)}
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
          <textarea
            value={feedbackOptimizationComment}
            onChange={(e) => setFeedbackOptimizationComment(e.currentTarget.value)}
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
              onClick={() => setFeedbackDialogOpen(false)}
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
                  if (ok) {
                    setFeedbackScore(null);
                    setFeedbackNote("");
                    setFeedbackOptimizationComment("");
                  }
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
              {refining ? "AI 优化中..." : "保存反馈并生成新版本"}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
