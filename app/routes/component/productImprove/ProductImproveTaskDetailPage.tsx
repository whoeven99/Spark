import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { TaskStatusBadge } from "../aiTask/TaskStatusBadge";
import { DialogShell } from "../shared/DialogShell";
import type {
  AITaskItem,
  AITaskStatus,
  ProductImproveTaskConfig,
  ProductImproveTaskResult,
} from "../../../lib/aiTaskTypes";
import { safeTranslateAITaskMessage } from "../../../lib/aiTaskMessage";

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

function formatTaskDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatActualElapsed(
  startedAt: string | null,
  completedAt: string | null,
  locale: string,
): string | null {
  if (!startedAt || !completedAt) return null;
  const elapsedMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  const minuteText = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "minute",
    unitDisplay: "short",
  }).format(minutes);
  const secondText = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "second",
    unitDisplay: "short",
  }).format(remainingSeconds);
  return minutes > 0 ? `${minuteText} ${secondText}` : secondText;
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

function readStringField(source: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumberField(source: Record<string, unknown> | null | undefined, key: string): number | null {
  const value = source?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatDisplayValue(value: string | number | null | undefined, fallback: string): string {
  if (value == null || value === "") return fallback;
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
      sourceLabel: "",
      statusNote: null,
      applied: task.status === "applied",
    },
  ];
}

function ReviewContentPanel(props: {
  label: string;
  titleLabel: string;
  descriptionLabel: string;
  emptyTitleText: string;
  emptyDescriptionText: string;
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
            {props.titleLabel}
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
              {props.title || props.emptyTitleText}
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
            {props.descriptionLabel}
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
              {props.description || props.emptyDescriptionText}
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
  const { t, i18n } = useTranslation();
  const unknownText = t("common.unknown");
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
  const actualElapsed = formatActualElapsed(task.startedAt, task.completedAt, i18n.language);
  const shortId = task.id.slice(0, 8).toUpperCase();
  const summaryDescription =
    localStatus === "applied"
      ? t("productImproveStage1.detailSummaryApplied")
      : t("productImproveStage1.detailSummaryReview");
  const itemCount = formatDisplayValue(
    readNumberField(extendedConfig, "itemCount"),
    unknownText,
  );
  const sourceLanguage = formatDisplayValue(
    readStringField(extendedConfig, "sourceLanguage"),
    unknownText,
  );
  const brandStyle = formatDisplayValue(
    readStringField(extendedConfig, "brandStyle"),
    unknownText,
  );
  const productLabel =
    cfg.originalTitle ||
    t("productImproveStage1.productFallbackName", {
      id: cfg.productId || shortId,
    });
  const activeRecord =
    resultRecords.find((record) => record.id === activeRecordId) ?? resultRecords[0] ?? null;
  const editingLocked = refining || applying || localStatus === "applied";

  useEffect(() => {
    setLocalStatus(task.status);
  }, [task.status]);

  useEffect(() => {
    setLocalResult(task.result);
    const nextRecords = buildInitialResultRecords(task);
    if (nextRecords[0]) {
      nextRecords[0].sourceLabel = t("productImproveStage1.recordSourceInitial");
    }
    setResultRecords(nextRecords);
    setActiveRecordId(nextRecords[0]?.id ?? "");
  }, [t, task]);

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
      setApplyError(t("productImproveStage1.applyValidationCompleteTitleDescription"));
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
        setApplyError(
          updateBody.errorMsg
            ? safeTranslateAITaskMessage({
                t,
                message: updateBody.errorMsg,
              })
            : t("productImproveStage1.applyWriteShopifyFailed"),
        );
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
          statusNote: item.id === record.id ? t("productImproveStage1.recordStatusApplied") : item.statusNote,
        })),
      );
      setActiveRecordId(record.id);
      handleStatusChange("applied", reviewedResult);
    } catch {
      setApplyError(t("productImproveStage1.applyNetworkError"));
    } finally {
      setApplying(false);
    }
  }

  async function handleRefine(): Promise<boolean> {
    if (!feedbackRecordId) {
      setRefineError(t("productImproveStage1.refineRecordMissing"));
      return false;
    }

    const sourceRecord = resultRecords.find((record) => record.id === feedbackRecordId);
    if (!sourceRecord) {
      setRefineError(t("productImproveStage1.refineRecordMissing"));
      return false;
    }

    if (!sourceRecord.title.trim() || !sourceRecord.description.trim()) {
      setRefineError(t("productImproveStage1.refineDraftMissing"));
      return false;
    }
    if (!feedbackOptimizationComment.trim()) {
      setRefineError(t("productImproveStage1.refineCommentRequired"));
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
      feedbackScore !== null
        ? t("productImproveStage1.feedbackScoreSummary", { score: feedbackScore })
        : null,
      feedbackNote.trim()
        ? t("productImproveStage1.feedbackNoteSummary", { note: feedbackNote.trim() })
        : null,
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
        setRefineError(
          body.errorMsg
            ? safeTranslateAITaskMessage({
                t,
                message: body.errorMsg,
              })
            : t("productImproveStage1.refineFailed"),
        );
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
        sourceLabel: t("productImproveStage1.recordSourceRefined", {
          version: sourceRecord.version,
        }),
        statusNote: t("productImproveStage1.recordStatusGeneratedFromVersion", {
          version: sourceRecord.version,
        }),
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
                  statusNote: t("productImproveStage1.recordStatusGeneratedVersion", {
                    version: nextVersion,
                  }),
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
      setRefineError(t("productImproveStage1.refineNetworkError"));
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
                {t("productImproveStage1.backToTaskList")}
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
              {t("productImproveStage1.taskSummaryTitle")}
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
            {t("aiTask.createdAtLabel", {
              value: formatTaskDate(task.createdAt, i18n.language),
            })}
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
          <span>{t("productImproveStage1.taskDetailLabel")}</span>
          <span>{t("productImproveStage1.itemCountValue", { count: itemCount })}</span>
          <span style={{ color: pageColorTokens.textFootnote }}>|</span>
          <span>
            {t("productImproveStage1.outputLanguageValue", {
              value: cfg.targetLanguage ?? unknownText,
            })}
          </span>
          <span style={{ color: pageColorTokens.textFootnote }}>|</span>
          <span>{t("productImproveStage1.sourceLanguageValue", { value: sourceLanguage })}</span>
          <span style={{ color: pageColorTokens.textFootnote }}>|</span>
          <span>{t("productImproveStage1.brandStyleValue", { value: brandStyle })}</span>
          {actualElapsed ? (
            <>
              <span style={{ color: pageColorTokens.textFootnote }}>|</span>
              <span>{t("productImproveStage1.actualElapsedValue", { value: actualElapsed })}</span>
            </>
          ) : null}
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
            {t("productImproveStage1.productValue", { value: productLabel })}
          </span>
        </div>
      </div>

      <SectionShell
        title={t("productImproveStage1.reviewSectionTitle")}
        description={t("productImproveStage1.reviewSectionDescription")}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          <ReviewContentPanel
            label={t("productImproveStage1.originalContentLabel")}
            titleLabel={t("productImproveStage1.titleLabel")}
            descriptionLabel={t("productImproveStage1.descriptionLabel")}
            emptyTitleText={t("productImproveStage1.emptyTitle")}
            emptyDescriptionText={t("productImproveStage1.emptyOriginalDescription")}
            title={cfg.originalTitle ?? ""}
            description={cfg.originalText ?? ""}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <ReviewContentPanel
              label={
                activeRecord
                  ? t("productImproveStage1.generatedContentVersionLabel", {
                      version: activeRecord.version,
                    })
                  : t("productImproveStage1.generatedContentLabel")
              }
              titleLabel={t("productImproveStage1.titleLabel")}
              descriptionLabel={t("productImproveStage1.descriptionLabel")}
              emptyTitleText={t("productImproveStage1.emptyTitle")}
              emptyDescriptionText={t("productImproveStage1.emptyDescription")}
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
                {applying
                  ? t("productImproveStage1.applyingCurrentVersion")
                  : t("productImproveStage1.applyCurrentVersion")}
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
              <span>{t("productImproveStage1.appliedToShopify")}</span>
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
                  {t("productImproveStage1.viewInShopifyAdmin")}
                </a>
              );
            })()}
          </div>
        ) : null}
      </SectionShell>

      <SectionShell
        title={t("productImproveStage1.resultRecordsTitle")}
        description={t("productImproveStage1.resultRecordsDescription")}
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
                        {t("productImproveStage1.recordAppliedTag")}
                      </span>
                    ) : null}
                  </div>
                  <span style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
                    {formatTaskDate(record.createdAt, i18n.language)}
                  </span>
                </div>

                <div style={{ fontSize: 13, fontWeight: 600, color: pageColorTokens.textPrimary }}>
                  {record.title || t("productImproveStage1.emptyTitle")}
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
                  {record.description || t("productImproveStage1.emptyDescription")}
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
                    {record.reviewScore !== null
                      ? t("productImproveStage1.recordScoreValue", { score: record.reviewScore })
                      : t("productImproveStage1.recordScoreEmpty")}
                  </span>
                  <span>
                    {record.reviewNote.trim()
                      ? t("productImproveStage1.recordReviewNoteValue", {
                          note: record.reviewNote,
                        })
                      : t("productImproveStage1.recordReviewNoteEmpty")}
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
                    {t("productImproveStage1.openFeedbackDialog")}
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
                    {isActive
                      ? t("productImproveStage1.editingThisVersion")
                      : t("productImproveStage1.editThisVersion")}
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
                    {t("productImproveStage1.applyThisVersion")}
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

      <DialogShell
        open={feedbackDialogOpen}
        width={520}
        closeDisabled={editingLocked}
        onClose={() => setFeedbackDialogOpen(false)}
        title={t("productImproveStage1.feedbackDialogTitle")}
        description={t("productImproveStage1.feedbackDialogDescription")}
        footer={
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
              {t("common.cancel")}
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
              {refining
                ? t("productImproveStage1.refining")
                : t("productImproveStage1.saveFeedbackAndGenerate")}
            </button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
            placeholder={t("productImproveStage1.feedbackNotePlaceholder")}
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
            placeholder={t("productImproveStage1.feedbackOptimizationPlaceholder")}
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
        </div>
      </DialogShell>
    </div>
  );
}
