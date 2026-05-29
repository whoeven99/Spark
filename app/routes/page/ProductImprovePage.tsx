import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { useProductImprove } from "../../hooks/useProductImprove";
import { useProductQualityScore } from "../../hooks/useProductQualityScore";
import type { ProductQualityScoreResult as ProductQualityScoreTaskResult } from "../../hooks/useProductQualityScore";
import type { loader } from "../app.product-improve";
import type { ProductSelectorSelection } from "../../lib/productSearchTypes";
import { ProductSelector } from "../component/product/ProductSelector";
import { GenerateDescriptionResultEditor } from "../component/productImprove/GenerateDescriptionResultEditor";
import { ProductQualityScoreResult } from "../component/productImprove/ProductQualityScoreResult";
import {
  PageSectionHeader,
  PageSurface,
  pageColorTokens,
  formErrorBoxStyle,
  pageContentStyle,
  pageEmptyStateStyle,
  pageFieldLabelStyle,
  pageHintTextStyle,
  pageLinkHintStyle,
  pageSelectStyle,
  pageStatusBadgeStyle,
  pageTrustFootnoteStyle,
} from "./pageUiStyles";

type TaskStatus = "running" | "review_required" | "applied" | "scored" | "failed";
type TaskKind = "generate" | "quality_score";

type ProductImproveTask = {
  id: string;
  kind: TaskKind;
  status: TaskStatus;
  productId: string;
  productLabel: string;
  targetLanguage?: string;
  createdAt: number;
  estimateTime: string;
  estimateCredits: number;
  actualTime?: string;
  actualCredits?: number;
  progress: number;
  logs: string[];
  errorText?: string;
  resultTitle?: string;
  resultDescription?: string;
  scoreResult?: ProductQualityScoreTaskResult;
};

const tabRailStyle: CSSProperties = {
  display: "inline-flex",
  gap: "0.5rem",
  padding: "0.35rem",
  borderRadius: "999px",
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surface,
  boxShadow: pageColorTokens.shadowCard,
};

const tabButtonStyle = (active: boolean): CSSProperties => ({
  border: "none",
  cursor: "pointer",
  borderRadius: "999px",
  padding: "0.7rem 1rem",
  background: active
    ? `linear-gradient(135deg, ${pageColorTokens.brandGreenDeep} 0%, ${pageColorTokens.brandGreen} 100%)`
    : "transparent",
  color: active ? "#ffffff" : pageColorTokens.textBody,
  fontSize: "0.875rem",
  fontWeight: 700,
  boxShadow: active ? "0 8px 22px rgba(0, 92, 70, 0.18)" : "none",
});

const taskMetaGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "0.75rem",
  marginTop: "1rem",
};

const taskMetaItemStyle: CSSProperties = {
  padding: "0.85rem 0.9rem",
  borderRadius: "12px",
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surfaceMuted,
};

const taskCardStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  background: pageColorTokens.surface,
  boxShadow: pageColorTokens.shadowCard,
  padding: "1rem 1.1rem",
};

const taskLogStyle: CSSProperties = {
  margin: "0.25rem 0 0",
  paddingLeft: "1rem",
  color: pageColorTokens.textSecondary,
  fontSize: "0.8125rem",
  lineHeight: 1.6,
};

const progressTrackStyle: CSSProperties = {
  width: "100%",
  height: "8px",
  borderRadius: "999px",
  background: pageColorTokens.progressTrackGradient,
  overflow: "hidden",
};

function buildTaskId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTaskTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatDurationMs(value: number) {
  if (value < 60_000) return `${Math.max(1, Math.round(value / 1000))}s`;
  const mins = Math.max(1, Math.round(value / 60_000));
  return `${mins} min`;
}

export function ProductImprovePage() {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const loaderData = useLoaderData<typeof loader>();
  const billing = loaderData.billing;
  const [activeTab, setActiveTab] = useState<"config" | "tasks">("config");
  const [selectedProduct, setSelectedProduct] =
    useState<ProductSelectorSelection | null>(null);
  const [productId, setProductId] = useState("");
  const [showManualProductId, setShowManualProductId] = useState(false);
  const [tasks, setTasks] = useState<ProductImproveTask[]>([]);
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [activeReviewTaskId, setActiveReviewTaskId] = useState<string | null>(null);
  const estimateDialogRef = useRef<HTMLDialogElement>(null);
  const taskTimerRef = useRef<number[]>([]);

  const search =
    typeof window !== "undefined" ? window.location.search : "";

  const {
    targetLanguage,
    setTargetLanguage,
    localeOptions,
    localesLoading,
    isSubmitting,
    isSaving,
    errorText,
    saveErrorText,
    description,
    draftTitle,
    setDraftTitle,
    draftDescription,
    setDraftDescription,
    copyTarget,
    saveConfirmOpen,
    requestOpenSaveDialog,
    cancelSaveDialog,
    confirmSaveToShopify,
    submitGenerate,
    copyTitle,
    copyDescription,
    copyAll,
    resetResult,
    localesIsFallback,
  } = useProductImprove({
    locationSearch: search,
    initialShopLocales: loaderData.shopLocales,
    toastShow: (message) => {
      shopify.toast.show(message);
    },
  });

  const { isScoring, submitScore, resetScore } =
    useProductQualityScore({
      locationSearch: search,
      toastShow: (message) => {
        shopify.toast.show(message);
      },
    });

  useEffect(() => {
    const dialog = estimateDialogRef.current;
    if (!dialog) return;
    if (estimateOpen) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [estimateOpen]);

  useEffect(() => {
    return () => {
      taskTimerRef.current.forEach((id) => window.clearTimeout(id));
      taskTimerRef.current = [];
    };
  }, []);

  const updateTask = (
    taskId: string,
    updater: (task: ProductImproveTask) => ProductImproveTask,
  ) => {
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? updater(task) : task)),
    );
  };

  const appendTimedTaskUpdate = (
    taskId: string,
    delayMs: number,
    nextProgress: number,
    message: string,
  ) => {
    const timer = window.setTimeout(() => {
      updateTask(taskId, (task) =>
        task.status !== "running"
          ? task
          : {
              ...task,
              progress: Math.max(task.progress, nextProgress),
              logs: [...task.logs, message],
            },
      );
    }, delayMs);
    taskTimerRef.current.push(timer);
  };

  const primaryProductId = (selectedProduct?.id ?? productId).trim();
  const primaryProductLabel = selectedProduct?.title ?? primaryProductId;
  const estimateCredits = 320;
  const estimateTime = "1-2 min";
  const estimateScope = primaryProductLabel || "-";
  const copyBusy = copyTarget !== null;
  const tasksCountLabel = t("productImproveStage1.tasksBadge", {
    count: tasks.length,
  });

  const handleOpenEstimate = () => {
    if (!primaryProductId) {
      shopify.toast.show(t("generate.validationSelectProductId"));
      return;
    }
    if (!targetLanguage.trim()) {
      shopify.toast.show(t("generate.validationSelectTargetLanguage"));
      return;
    }
    if (localesLoading) {
      shopify.toast.show(t("generate.validationLocalesLoading"));
      return;
    }
    setEstimateOpen(true);
  };

  const handleGenerate = async () => {
    const pid = primaryProductId;
    const taskId = buildTaskId("generate");
    const startedAt = Date.now();

    setEstimateOpen(false);
    setActiveTab("tasks");
    setActiveReviewTaskId(null);
    setTasks((current) => [
      {
        id: taskId,
        kind: "generate",
        status: "running",
        productId: pid,
        productLabel: primaryProductLabel || pid,
        targetLanguage,
        createdAt: startedAt,
        estimateTime,
        estimateCredits,
        progress: 8,
        logs: ["已创建生成任务，准备读取商品信息。"],
      },
      ...current,
    ]);

    appendTimedTaskUpdate(taskId, 300, 24, "正在读取 Shopify 商品信息。");
    appendTimedTaskUpdate(taskId, 1100, 56, "正在整理卖点与目标语言语境。");
    appendTimedTaskUpdate(taskId, 2200, 82, "正在生成标题和描述草稿。");

    const outcome = await submitGenerate(pid);
    if (outcome?.ok) {
      updateTask(taskId, (task) => ({
        ...task,
        status: "review_required",
        progress: 100,
        logs: [...task.logs, "生成完成，等待审查后写入 Shopify。"],
        actualTime: formatDurationMs(Date.now() - startedAt),
        actualCredits: estimateCredits,
        resultTitle: outcome.result.title,
        resultDescription: outcome.result.description,
      }));
      setActiveReviewTaskId(taskId);
      setActiveTab("tasks");
      return;
    }

    updateTask(taskId, (task) => ({
      ...task,
      status: "failed",
      progress: 100,
      logs: [...task.logs, "任务执行失败，请检查参数后重试。"],
      actualTime: formatDurationMs(Date.now() - startedAt),
      errorText: outcome?.errorText ?? t("chat.sendFailed"),
    }));
  };

  const handleScore = async () => {
    const pid = (selectedProduct?.id ?? productId).trim();
    if (!pid) {
      shopify.toast.show(t("generate.validationSelectProductId"));
      return;
    }

    const taskId = buildTaskId("score");
    const startedAt = Date.now();
    setActiveTab("tasks");
    setTasks((current) => [
      {
        id: taskId,
        kind: "quality_score",
        status: "running",
        productId: pid,
        productLabel: primaryProductLabel || pid,
        createdAt: startedAt,
        estimateTime: "30-60s",
        estimateCredits: 120,
        progress: 12,
        logs: ["已创建评分任务，准备分析商品质量。"],
      },
      ...current,
    ]);

    appendTimedTaskUpdate(taskId, 250, 38, "正在读取商品标题、图片与描述信息。");
    appendTimedTaskUpdate(taskId, 900, 72, "正在计算质量得分与优化建议。");

    const outcome = await submitScore(pid);
    if (outcome?.ok) {
      updateTask(taskId, (task) => ({
        ...task,
        status: "scored",
        progress: 100,
        logs: [...task.logs, "质量评分已完成。"],
        actualTime: formatDurationMs(Date.now() - startedAt),
        actualCredits: 120,
        scoreResult: outcome.result,
      }));
      return;
    }

    updateTask(taskId, (task) => ({
      ...task,
      status: "failed",
      progress: 100,
      logs: [...task.logs, "质量评分失败，请稍后重试。"],
      actualTime: formatDurationMs(Date.now() - startedAt),
      errorText: outcome?.errorText ?? t("chat.sendFailed"),
    }));
  };

  const billingBadge =
    billing.billingRequired && !billing.hasAccess ? (
      <span style={pageStatusBadgeStyle}>{t("generate.billingBadgeLow")}</span>
    ) : null;

  const handleApplyTask = async (taskId: string, fallbackProductId: string) => {
    const saved = await confirmSaveToShopify(fallbackProductId);
    if (!saved) return;
    updateTask(taskId, (task) => ({
      ...task,
      status: "applied",
      logs: [...task.logs, "已写入 Shopify。"],
      actualTime: task.actualTime ?? "1 min",
      actualCredits: task.actualCredits ?? estimateCredits,
    }));
    setActiveReviewTaskId(null);
  };

  const renderStatusBadge = (status: TaskStatus) => {
    const label =
      status === "running"
        ? t("productImproveStage1.statusRunning")
        : status === "review_required"
          ? t("productImproveStage1.statusReview")
          : status === "applied"
            ? t("productImproveStage1.statusApplied")
            : status === "scored"
              ? t("productImproveStage1.statusScored")
              : t("productImproveStage1.statusFailed");
    const toneStyle: CSSProperties =
      status === "running"
        ? {
            background: pageColorTokens.brandBlueLight,
            color: pageColorTokens.brandBlueDark,
            borderColor: "rgba(64, 112, 244, 0.2)",
          }
        : status === "review_required"
          ? {
              background: "rgba(245, 158, 11, 0.12)",
              color: "#b45309",
              borderColor: "rgba(245, 158, 11, 0.2)",
            }
          : status === "applied"
            ? {
                background: pageColorTokens.brandGreenLight,
                color: pageColorTokens.brandGreenDeep,
                borderColor: "rgba(0, 166, 124, 0.2)",
              }
            : status === "scored"
              ? {
                  background: "rgba(124, 58, 237, 0.1)",
                  color: "#6d28d9",
                  borderColor: "rgba(124, 58, 237, 0.2)",
                }
              : {
                  background: pageColorTokens.criticalBg,
                  color: pageColorTokens.criticalText,
                  borderColor: "rgba(220, 38, 38, 0.2)",
                };

    return (
      <span
        style={{
          ...pageStatusBadgeStyle,
          ...toneStyle,
        }}
      >
        {label}
      </span>
    );
  };

  return (
    <s-page heading={t("generate.pageTitle")}>
      <div style={pageContentStyle}>
        {billing.billingRequired && !billing.hasAccess ? (
          <s-banner tone="warning">
            {t("billing.lowBalanceWarning")}{" "}
            <s-link href={`/app/billing${search}`}>{t("billing.openBillingPage")}</s-link>
          </s-banner>
        ) : null}

        <PageSectionHeader
          title={t("generate.sectionTitle")}
          subtitle={t("productImproveStage1.subtitle")}
          badge={billingBadge}
        />

        <div style={tabRailStyle}>
          <button
            type="button"
            style={tabButtonStyle(activeTab === "config")}
            onClick={() => setActiveTab("config")}
          >
            {t("productImproveStage1.tabsConfig")}
          </button>
          <button
            type="button"
            style={tabButtonStyle(activeTab === "tasks")}
            onClick={() => setActiveTab("tasks")}
          >
            {t("productImproveStage1.tabsTasks")}
          </button>
        </div>

        {activeTab === "config" ? (
          <>
            <PageSurface
              title={t("generate.formCardTitle")}
              subtitle={t("productImproveStage1.configHint")}
            >
              <s-stack direction="block" gap="base">
                <ProductSelector
                  locationSearch={search}
                  selected={selectedProduct}
                  onSelectedChange={setSelectedProduct}
                />
                <details
                  style={{ marginTop: "0.25rem" }}
                  open={showManualProductId}
                  onToggle={(e) => setShowManualProductId(e.currentTarget.open)}
                >
                  <summary style={pageLinkHintStyle}>
                    {t("generate.advancedManualProductId")}
                  </summary>
                  <div style={{ marginTop: "0.65rem" }}>
                    <s-text-field
                      label={t("generate.productIdLabel")}
                      value={productId}
                      onChange={(e) => setProductId(e.currentTarget.value)}
                      autocomplete="off"
                    />
                  </div>
                </details>

                <div>
                  <label htmlFor="generate-description-lang" style={pageFieldLabelStyle}>
                    {t("generate.targetLanguage")}
                  </label>
                  <select
                    id="generate-description-lang"
                    value={targetLanguage}
                    onChange={(e) => setTargetLanguage(e.target.value)}
                    disabled={localesLoading || isSubmitting || isSaving || saveConfirmOpen}
                    style={pageSelectStyle(
                      localesLoading || isSubmitting || isSaving || saveConfirmOpen,
                    )}
                  >
                    {localesLoading && localeOptions.length === 0 ? (
                      <option value="">{t("common.loadingLanguage")}</option>
                    ) : null}
                    {localeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {localesIsFallback ? (
                    <div style={pageHintTextStyle}>
                      {t("generate.fallbackLocalesHint")}{" "}
                      <code style={{ fontSize: "0.7rem" }}>read_locales</code>
                    </div>
                  ) : null}
                </div>

                {errorText ? <div style={formErrorBoxStyle}>{errorText}</div> : null}

                <s-stack direction="inline" gap="small">
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={() => {
                      handleOpenEstimate();
                    }}
                    {...(isSubmitting || isSaving || localesLoading || saveConfirmOpen
                      ? { disabled: true }
                      : {})}
                  >
                    {isSubmitting
                      ? t("generate.generating")
                      : localesLoading
                        ? t("common.loadingLanguage")
                        : t("generate.generateAction")}
                  </s-button>
                  <s-button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      void handleScore();
                    }}
                    {...(isScoring || isSubmitting || isSaving ? { disabled: true } : {})}
                  >
                    {isScoring ? t("qualityScore.scoring") : t("qualityScore.scoreAction")}
                  </s-button>
                  <s-button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      resetResult();
                      resetScore();
                      setSelectedProduct(null);
                      setProductId("");
                      setActiveReviewTaskId(null);
                    }}
                    {...(isSubmitting || isSaving || isScoring ? { disabled: true } : {})}
                  >
                    {t("common.clearResult")}
                  </s-button>
                </s-stack>
              </s-stack>
            </PageSurface>
            <p style={pageTrustFootnoteStyle}>{t("productImproveStage1.stage1BatchHint")}</p>
          </>
        ) : (
          <PageSurface
            title={t("productImproveStage1.taskListTitle")}
            subtitle={t("productImproveStage1.taskListSubtitle")}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "1rem",
                flexWrap: "wrap",
                marginBottom: "1rem",
              }}
            >
              <div style={{ color: pageColorTokens.textSecondary, fontSize: "0.875rem" }}>
                {tasksCountLabel}
              </div>
              <s-button
                type="button"
                variant="secondary"
                onClick={() => setActiveTab("config")}
              >
                {t("productImproveStage1.backToConfig")}
              </s-button>
            </div>

            {tasks.length === 0 ? (
              <div style={pageEmptyStateStyle}>
                <span style={{ fontSize: "1.75rem", opacity: 0.6 }} aria-hidden>
                  🗂
                </span>
                <span>{t("productImproveStage1.taskEmpty")}</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {tasks.map((task) => (
                  <div key={task.id} style={taskCardStyle}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "0.85rem",
                        alignItems: "start",
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: "1rem",
                            fontWeight: 700,
                            color: pageColorTokens.textPrimary,
                          }}
                        >
                          {task.kind === "generate"
                            ? t("productImproveStage1.taskGenerate")
                            : t("productImproveStage1.taskScore")}
                        </div>
                        <div
                          style={{
                            marginTop: "0.3rem",
                            color: pageColorTokens.textSecondary,
                            fontSize: "0.875rem",
                          }}
                        >
                          {task.productLabel}
                        </div>
                      </div>
                      {renderStatusBadge(task.status)}
                    </div>

                    <div style={taskMetaGridStyle}>
                      <div style={taskMetaItemStyle}>
                        <div style={pageFieldLabelStyle}>{t("productImproveStage1.taskProduct")}</div>
                        <div style={{ color: pageColorTokens.textPrimary }}>{task.productLabel}</div>
                      </div>
                      <div style={taskMetaItemStyle}>
                        <div style={pageFieldLabelStyle}>{t("productImproveStage1.taskLanguage")}</div>
                        <div style={{ color: pageColorTokens.textPrimary }}>
                          {task.targetLanguage || "-"}
                        </div>
                      </div>
                      <div style={taskMetaItemStyle}>
                        <div style={pageFieldLabelStyle}>{t("productImproveStage1.taskCreatedAt")}</div>
                        <div style={{ color: pageColorTokens.textPrimary }}>
                          {formatTaskTime(task.createdAt)}
                        </div>
                      </div>
                      <div style={taskMetaItemStyle}>
                        <div style={pageFieldLabelStyle}>{t("productImproveStage1.taskEstimate")}</div>
                        <div style={{ color: pageColorTokens.textPrimary }}>
                          {task.estimateTime} / {task.estimateCredits} Token
                        </div>
                      </div>
                      <div style={taskMetaItemStyle}>
                        <div style={pageFieldLabelStyle}>{t("productImproveStage1.taskActual")}</div>
                        <div style={{ color: pageColorTokens.textPrimary }}>
                          {task.actualTime
                            ? `${task.actualTime} / ${task.actualCredits ?? 0} Token`
                            : "-"}
                        </div>
                      </div>
                    </div>

                    {task.status === "running" ? (
                      <div style={{ marginTop: "1rem" }}>
                        <div style={progressTrackStyle}>
                          <div
                            style={{
                              width: `${task.progress}%`,
                              height: "100%",
                              borderRadius: "999px",
                              background: `linear-gradient(90deg, ${pageColorTokens.brandBlue} 0%, ${pageColorTokens.brandGreen} 100%)`,
                              transition: "width 220ms ease",
                            }}
                          />
                        </div>
                        <div style={{ marginTop: "0.5rem", color: pageColorTokens.textSecondary, fontSize: "0.8125rem" }}>
                          {task.progress}% complete
                        </div>
                      </div>
                    ) : null}

                    {task.logs.length > 0 ? (
                      <div style={{ marginTop: "1rem" }}>
                        <div style={pageFieldLabelStyle}>{t("productImproveStage1.logTitle")}</div>
                        <ul style={taskLogStyle}>
                          {task.logs.map((log, index) => (
                            <li key={`${task.id}-${index}`}>{log}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {task.status === "review_required" ? (
                      <div style={{ marginTop: "1rem" }}>
                        {activeReviewTaskId === task.id && description !== null ? (
                          <GenerateDescriptionResultEditor
                            variant="page"
                            draftTitle={draftTitle}
                            draftDescription={draftDescription}
                            onDraftTitleChange={setDraftTitle}
                            onDraftDescriptionChange={setDraftDescription}
                            copyTarget={copyTarget}
                            copyBusy={copyBusy}
                            isSubmitting={isSubmitting}
                            isSaving={isSaving}
                            saveErrorText={saveErrorText}
                            onCopyTitle={copyTitle}
                            onCopyDescription={copyDescription}
                            onCopyAll={copyAll}
                            onClickSave={requestOpenSaveDialog}
                            saveConfirmOpen={saveConfirmOpen}
                            onSaveConfirm={() => {
                              void handleApplyTask(task.id, task.productId);
                            }}
                            onSaveCancel={cancelSaveDialog}
                          />
                        ) : (
                          <div style={{ ...pageEmptyStateStyle, padding: "1rem 1.2rem" }}>
                            <span>{task.resultTitle || t("generate.resultTitle")}</span>
                            <s-button
                              type="button"
                              variant="secondary"
                              onClick={() => setActiveReviewTaskId(task.id)}
                            >
                              {t("productImproveStage1.openReview")}
                            </s-button>
                          </div>
                        )}
                      </div>
                    ) : null}

                    {task.status === "applied" ? (
                      <div
                        style={{
                          marginTop: "1rem",
                          padding: "0.9rem 1rem",
                          borderRadius: "12px",
                          background: pageColorTokens.brandGreenLight,
                          color: pageColorTokens.brandGreenDeep,
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "1rem",
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <div>结果已写入 Shopify，可继续发起下一轮优化或其他加工。</div>
                        <s-button
                          type="button"
                          variant="secondary"
                          onClick={() => setActiveTab("config")}
                        >
                          {t("productImproveStage1.continueProcess")}
                        </s-button>
                      </div>
                    ) : null}

                    {task.status === "scored" ? (
                      <div style={{ marginTop: "1rem" }}>
                        <ProductQualityScoreResult
                          result={task.scoreResult ?? null}
                          isScoring={false}
                          errorText={null}
                        />
                      </div>
                    ) : null}

                    {task.status === "failed" && task.errorText ? (
                      <div style={{ marginTop: "1rem" }}>
                        <div style={formErrorBoxStyle}>{task.errorText}</div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </PageSurface>
        )}

        <p style={pageTrustFootnoteStyle}>{t("generate.pageFootnote")}</p>
      </div>

      <dialog
        ref={estimateDialogRef}
        onCancel={(event) => {
          event.preventDefault();
          if (!isSubmitting) setEstimateOpen(false);
        }}
        style={{
          maxWidth: "460px",
          width: "calc(100% - 2rem)",
          padding: 0,
          border: "none",
          borderRadius: "16px",
          boxShadow: pageColorTokens.shadowModal,
        }}
      >
        <div style={{ padding: "1.2rem 1.25rem" }}>
          <div
            style={{
              fontSize: "1rem",
              fontWeight: 700,
              color: pageColorTokens.textPrimary,
              marginBottom: "0.4rem",
            }}
          >
            {t("productImproveStage1.estimateTitle")}
          </div>
          <div
            style={{
              fontSize: "0.875rem",
              color: pageColorTokens.textSecondary,
              lineHeight: 1.5,
              marginBottom: "1rem",
            }}
          >
            {t("productImproveStage1.estimateDesc")}
          </div>
          <div style={taskMetaGridStyle}>
            <div style={taskMetaItemStyle}>
              <div style={pageFieldLabelStyle}>{t("productImproveStage1.estimateScope")}</div>
              <div style={{ color: pageColorTokens.textPrimary }}>{estimateScope}</div>
            </div>
            <div style={taskMetaItemStyle}>
              <div style={pageFieldLabelStyle}>{t("productImproveStage1.estimateTime")}</div>
              <div style={{ color: pageColorTokens.textPrimary }}>{estimateTime}</div>
            </div>
            <div style={taskMetaItemStyle}>
              <div style={pageFieldLabelStyle}>{t("productImproveStage1.estimateCredits")}</div>
              <div style={{ color: pageColorTokens.textPrimary }}>{estimateCredits} Token</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
            <s-button type="button" variant="secondary" onClick={() => setEstimateOpen(false)}>
              {t("common.cancel")}
            </s-button>
            <s-button
              type="button"
              variant="primary"
              onClick={() => {
                void handleGenerate();
              }}
              {...(isSubmitting ? { disabled: true } : {})}
            >
              {isSubmitting
                ? t("generate.generating")
                : t("productImproveStage1.estimateConfirm")}
            </s-button>
          </div>
        </div>
      </dialog>
    </s-page>
  );
}
