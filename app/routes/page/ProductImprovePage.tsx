import { useEffect, useRef, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import {
  Alert,
  Button,
  Card,
  Collapse,
  Empty,
  Input,
  Modal,
  Progress,
  Select,
  Space,
  Tabs,
  Tag,
} from "antd";
import { useProductImprove } from "../../hooks/useProductImprove";
import { useProductQualityScore } from "../../hooks/useProductQualityScore";
import type { ProductQualityScoreResult as ProductQualityScoreTaskResult } from "../../hooks/useProductQualityScore";
import type { loader } from "../app.product-improve";
import type { ProductSelectorSelection } from "../../lib/productSearchTypes";
import { ProductSelector } from "../component/product/ProductSelector";
import { GenerateDescriptionResultEditor } from "../component/productImprove/GenerateDescriptionResultEditor";
import { ProductQualityScoreResult } from "../component/productImprove/ProductQualityScoreResult";
import { PageSectionHeader, pageContentStyle, pageTrustFootnoteStyle } from "./pageUiStyles";

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

const sectionCardClassName = "spark-ant-card rounded-app-card border border-app shadow-app-card";
const subtlePanelClassName = "rounded-app-control border border-app-subtle bg-app-subtle p-4";
const metaGridClassName = "mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5";
const metaItemClassName = "rounded-app-control border border-app-subtle bg-app-subtle px-4 py-3";
const taskCardClassName = "spark-ant-card rounded-app-card border border-app shadow-app-card";

const statusToneClassName: Record<TaskStatus, string> = {
  running: "border-app-subtle bg-app-muted text-app-text-secondary",
  review_required: "border-app-warning-subtle bg-app-warning-subtle text-app-warning",
  applied: "border-app-primary-subtle bg-app-primary-subtle text-app-success",
  scored: "border-app-subtle bg-app-subtle text-app-text-primary",
  failed: "border-app-critical-subtle bg-app-critical-subtle text-app-critical",
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
      <Tag
        bordered={false}
        className="m-0 rounded-full bg-app-warning-subtle px-3 py-1 text-app-warning"
      >
        {t("generate.billingBadgeLow")}
      </Tag>
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
    return (
      <Tag
        bordered
        className={`m-0 rounded-full px-3 py-1 text-xs font-semibold ${statusToneClassName[status]}`}
      >
        {label}
      </Tag>
    );
  };

  const clearCurrentResult = () => {
    resetResult();
    resetScore();
    setSelectedProduct(null);
    setProductId("");
    setActiveReviewTaskId(null);
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
        <div className="mt-4 rounded-full border border-app-subtle bg-app-muted p-1">
          <Tabs
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as "config" | "tasks")}
            className="spark-ant-tabs"
            items={[
              {
                key: "config",
                label: t("productImproveStage1.tabsConfig"),
                children: (
                  <>
                    <Card className={sectionCardClassName}>
                      <div className="mb-5">
                        <div className="text-[18px] font-semibold text-app-text-primary">
                          {t("generate.formCardTitle")}
                        </div>
                        <div className="mt-1 text-sm leading-6 text-app-text-secondary">
                          {t("productImproveStage1.configHint")}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className={subtlePanelClassName}>
                          <ProductSelector
                            locationSearch={search}
                            selected={selectedProduct}
                            onSelectedChange={setSelectedProduct}
                          />
                          <Collapse
                            ghost
                            className="mt-3 [&_.ant-collapse-content-box]:px-0 [&_.ant-collapse-header]:px-0 [&_.ant-collapse-header-text]:text-sm [&_.ant-collapse-header-text]:font-medium [&_.ant-collapse-header-text]:text-app-text-secondary"
                            activeKey={showManualProductId ? ["manual-product-id"] : []}
                            onChange={(keys) => {
                              const nextKeys = Array.isArray(keys) ? keys : [keys];
                              setShowManualProductId(nextKeys.includes("manual-product-id"));
                            }}
                            items={[
                              {
                                key: "manual-product-id",
                                label: t("generate.advancedManualProductId"),
                                children: (
                                  <div className="pt-2">
                                    <label
                                      className="mb-2 block text-xs font-semibold tracking-[0.01em] text-app-text-secondary"
                                      htmlFor="manual-product-id"
                                    >
                                      {t("generate.productIdLabel")}
                                    </label>
                                    <Input
                                      id="manual-product-id"
                                      value={productId}
                                      onChange={(e) => setProductId(e.target.value)}
                                      autoComplete="off"
                                      disabled={isSubmitting || isSaving}
                                    />
                                  </div>
                                ),
                              },
                            ]}
                          />
                        </div>

                        <div className={subtlePanelClassName}>
                          <label
                            className="mb-2 block text-xs font-semibold tracking-[0.01em] text-app-text-secondary"
                            htmlFor="generate-description-lang"
                          >
                            {t("generate.targetLanguage")}
                          </label>
                          <Select
                            id="generate-description-lang"
                            value={targetLanguage || undefined}
                            className="w-full"
                            placeholder={t("generate.targetLanguage")}
                            onChange={(value) => setTargetLanguage(value)}
                            disabled={localesLoading || isSubmitting || isSaving || saveConfirmOpen}
                            options={localeOptions.map((opt) => ({
                              value: opt.value,
                              label: opt.label,
                            }))}
                            showSearch
                            optionFilterProp="label"
                          />
                          {localesLoading && localeOptions.length === 0 ? (
                            <div className="mt-2 text-xs text-app-text-footnote">
                              {t("common.loadingLanguage")}
                            </div>
                          ) : null}
                          {localesIsFallback ? (
                            <div className="mt-2 text-xs leading-5 text-app-text-secondary">
                              {t("generate.fallbackLocalesHint")}{" "}
                              <code className="text-[11px]">read_locales</code>
                            </div>
                          ) : null}
                        </div>

                        {errorText ? (
                          <Alert
                            type="error"
                            showIcon
                            className="rounded-app-card"
                            message={errorText}
                          />
                        ) : null}

                        <div className={subtlePanelClassName}>
                          <Space wrap size="middle">
                            <Button
                              type="primary"
                              onClick={() => {
                                handleOpenEstimate();
                              }}
                              loading={isSubmitting}
                              disabled={isSaving || localesLoading || saveConfirmOpen}
                            >
                              {localesLoading
                                ? t("common.loadingLanguage")
                                : t("generate.generateAction")}
                            </Button>
                            <Button
                              onClick={() => {
                                void handleScore();
                              }}
                              loading={isScoring}
                              disabled={isSubmitting || isSaving}
                            >
                              {t("qualityScore.scoreAction")}
                            </Button>
                            <Button
                              onClick={() => {
                                clearCurrentResult();
                              }}
                              disabled={isSubmitting || isSaving || isScoring}
                            >
                              {t("common.clearResult")}
                            </Button>
                          </Space>
                        </div>
                      </div>
                    </Card>
                    <p style={pageTrustFootnoteStyle}>{t("productImproveStage1.stage1BatchHint")}</p>
                  </>
                ),
              },
              {
                key: "tasks",
                label: t("productImproveStage1.tabsTasks"),
                children: (
                  <Card className={sectionCardClassName}>
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="text-[18px] font-semibold text-app-text-primary">
                          {t("productImproveStage1.taskListTitle")}
                        </div>
                        <div className="mt-1 text-sm leading-6 text-app-text-secondary">
                          {t("productImproveStage1.taskListSubtitle")}
                        </div>
                      </div>
                      <Button onClick={() => setActiveTab("config")}>
                        {t("productImproveStage1.backToConfig")}
                      </Button>
                    </div>

                    <div className="mb-4 text-sm text-app-text-secondary">{tasksCountLabel}</div>

                    {tasks.length === 0 ? (
                      <Empty
                        className="spark-ant-empty rounded-app-card border border-dashed border-app-subtle bg-app-subtle py-10"
                        description={t("productImproveStage1.taskEmpty")}
                      />
                    ) : (
                      <div className="space-y-4">
                        {tasks.map((task) => (
                          <Card key={task.id} className={taskCardClassName}>
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div>
                                <div className="text-base font-semibold text-app-text-primary">
                                  {task.kind === "generate"
                                    ? t("productImproveStage1.taskGenerate")
                                    : t("productImproveStage1.taskScore")}
                                </div>
                                <div className="mt-1 text-sm text-app-text-secondary">
                                  {task.productLabel}
                                </div>
                              </div>
                              {renderStatusBadge(task.status)}
                            </div>

                            <div className={metaGridClassName}>
                              <div className={metaItemClassName}>
                                <div className="mb-1 text-xs font-semibold text-app-text-secondary">
                                  {t("productImproveStage1.taskProduct")}
                                </div>
                                <div className="text-sm text-app-text-primary">
                                  {task.productLabel}
                                </div>
                              </div>
                              <div className={metaItemClassName}>
                                <div className="mb-1 text-xs font-semibold text-app-text-secondary">
                                  {t("productImproveStage1.taskLanguage")}
                                </div>
                                <div className="text-sm text-app-text-primary">
                                  {task.targetLanguage || "-"}
                                </div>
                              </div>
                              <div className={metaItemClassName}>
                                <div className="mb-1 text-xs font-semibold text-app-text-secondary">
                                  {t("productImproveStage1.taskCreatedAt")}
                                </div>
                                <div className="text-sm text-app-text-primary">
                                  {formatTaskTime(task.createdAt)}
                                </div>
                              </div>
                              <div className={metaItemClassName}>
                                <div className="mb-1 text-xs font-semibold text-app-text-secondary">
                                  {t("productImproveStage1.taskEstimate")}
                                </div>
                                <div className="text-sm text-app-text-primary">
                                  {task.estimateTime} / {task.estimateCredits} Token
                                </div>
                              </div>
                              <div className={metaItemClassName}>
                                <div className="mb-1 text-xs font-semibold text-app-text-secondary">
                                  {t("productImproveStage1.taskActual")}
                                </div>
                                <div className="text-sm text-app-text-primary">
                                  {task.actualTime
                                    ? `${task.actualTime} / ${task.actualCredits ?? 0} Token`
                                    : "-"}
                                </div>
                              </div>
                            </div>

                            {task.status === "running" ? (
                              <div className="mt-4">
                                <Progress percent={task.progress} showInfo={false} strokeColor="#008060" />
                                <div className="mt-2 text-xs text-app-text-secondary">
                                  {task.progress}%
                                </div>
                              </div>
                            ) : null}

                            {task.logs.length > 0 ? (
                              <div className="mt-4">
                                <div className="text-xs font-semibold text-app-text-secondary">
                                  {t("productImproveStage1.logTitle")}
                                </div>
                                <ul className="mt-2 list-disc pl-5 text-[13px] leading-6 text-app-text-secondary">
                                  {task.logs.map((log, index) => (
                                    <li key={`${task.id}-${index}`}>{log}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}

                            {task.status === "review_required" ? (
                              <div className="mt-4">
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
                                  <div className="rounded-app-control border border-dashed border-app-subtle bg-app-subtle px-4 py-5">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <div className="text-sm text-app-text-primary">
                                        {task.resultTitle || t("generate.resultTitle")}
                                      </div>
                                      <Button onClick={() => setActiveReviewTaskId(task.id)}>
                                        {t("productImproveStage1.openReview")}
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : null}

                            {task.status === "applied" ? (
                              <div className="mt-4">
                                <Alert
                                  type="success"
                                  showIcon
                                  message="Shopify"
                                  description="结果已写入 Shopify，可继续发起下一轮优化或其他加工。"
                                  action={
                                    <Button size="small" onClick={() => setActiveTab("config")}>
                                      {t("productImproveStage1.continueProcess")}
                                    </Button>
                                  }
                                />
                              </div>
                            ) : null}

                            {task.status === "scored" ? (
                              <div className="mt-4">
                                <ProductQualityScoreResult
                                  result={task.scoreResult ?? null}
                                  isScoring={false}
                                  errorText={null}
                                />
                              </div>
                            ) : null}

                            {task.status === "failed" && task.errorText ? (
                              <div className="mt-4">
                                <Alert type="error" showIcon message={task.errorText} />
                              </div>
                            ) : null}
                          </Card>
                        ))}
                      </div>
                    )}
                  </Card>
                ),
              },
            ]}
          />
        </div>

        <p style={pageTrustFootnoteStyle}>{t("generate.pageFootnote")}</p>
      </div>

      <Modal
        open={estimateOpen}
        onCancel={() => {
          if (!isSubmitting) setEstimateOpen(false);
        }}
        footer={null}
        className="spark-ant-modal"
        destroyOnHidden
        maskClosable={!isSubmitting}
        width={460}
      >
        <div className="space-y-4">
          <div className={subtlePanelClassName}>
            <div className="text-base font-semibold text-app-text-primary">
              {t("productImproveStage1.estimateTitle")}
            </div>
            <div className="mt-1 text-sm leading-6 text-app-text-secondary">
              {t("productImproveStage1.estimateDesc")}
            </div>
          </div>

          <div className={subtlePanelClassName}>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className={metaItemClassName}>
                <div className="mb-1 text-xs font-semibold text-app-text-secondary">
                  {t("productImproveStage1.estimateScope")}
                </div>
                <div className="text-sm text-app-text-primary">{estimateScope}</div>
              </div>
              <div className={metaItemClassName}>
                <div className="mb-1 text-xs font-semibold text-app-text-secondary">
                  {t("productImproveStage1.estimateTime")}
                </div>
                <div className="text-sm text-app-text-primary">{estimateTime}</div>
              </div>
              <div className={metaItemClassName}>
                <div className="mb-1 text-xs font-semibold text-app-text-secondary">
                  {t("productImproveStage1.estimateCredits")}
                </div>
                <div className="text-sm text-app-text-primary">{estimateCredits} Token</div>
              </div>
            </div>
          </div>

          <div className={`${subtlePanelClassName} flex flex-wrap gap-3`}>
            <Button onClick={() => setEstimateOpen(false)} disabled={isSubmitting}>
              {t("common.cancel")}
            </Button>
            <Button
              type="primary"
              loading={isSubmitting}
              onClick={() => {
                void handleGenerate();
              }}
            >
              {t("productImproveStage1.estimateConfirm")}
            </Button>
          </div>
        </div>
      </Modal>
    </s-page>
  );
}
