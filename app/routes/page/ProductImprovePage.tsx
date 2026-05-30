import { useEffect, useRef, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { useFetcher, useLoaderData, useLocation } from "react-router";
import { Button, Modal, Space } from "antd";
import type { loader } from "../app.product-improve";
import type { ProductSelectorSelection } from "../../lib/productSearchTypes";
import { ProductSelector } from "../component/product/ProductSelector";
import { ProductImproveTaskListPage } from "../component/productImprove/ProductImproveTaskListPage";
import type { AITaskItem } from "../../lib/aiTaskTypes";
import { pageContentStyle, pageTrustFootnoteStyle } from "./pageUiStyles";

type PageTab = "config" | "tasks";
const ESTIMATED_TOKENS = 320;
const ESTIMATED_DURATION = "1-2 min";

const sectionCardClassName =
  "rounded-app-card border border-app-subtle bg-app-card p-5 shadow-app-card";
const subtlePanelClassName = "rounded-app-control border border-app-subtle bg-app-subtle p-4";

function PageTabBar({
  activeTab,
  onTabChange,
  runningCount,
}: {
  activeTab: PageTab;
  onTabChange: (tab: PageTab) => void;
  runningCount: number;
}) {
  const { t } = useTranslation();

  const tabClass = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
      active
        ? "border border-app-subtle bg-app-card text-app-text-primary shadow-app-card"
        : "border border-transparent bg-transparent text-app-text-secondary hover:text-app-text-primary"
    }`;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 rounded-full border border-app-subtle bg-app-muted p-1">
      <button type="button" className={tabClass(activeTab === "config")} onClick={() => onTabChange("config")}>
        {t("productImproveStage1.tabsConfig")}
      </button>
      <button type="button" className={tabClass(activeTab === "tasks")} onClick={() => onTabChange("tasks")}>
        {t("productImproveStage1.tabsTasks")}
        {runningCount > 0 ? (
          <span className="rounded-full bg-app-primary px-2 py-0.5 text-[11px] font-bold text-white">
            {runningCount}
          </span>
        ) : null}
      </button>
      {activeTab === "tasks" ? (
        <span className="ml-1 px-3 py-1 text-[13px] text-app-text-secondary">
          {t("productImproveStage1.taskListSubtitle")}
        </span>
      ) : null}
    </div>
  );
}

export function ProductImprovePage() {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const location = useLocation();
  const loaderData = useLoaderData<typeof loader>();
  const billing = loaderData.billing;
  const [tasks, setTasks] = useState<AITaskItem[]>(loaderData.recentTasks);
  const [pageTab, setPageTab] = useState<PageTab>("config");
  const [mounted, setMounted] = useState(false);

  const shopLocales = loaderData.shopLocales;
  const [selectedProduct, setSelectedProduct] = useState<ProductSelectorSelection | null>(null);
  const [productId, setProductId] = useState("");
  const [targetLanguage, setTargetLanguage] = useState(
    shopLocales?.defaultTargetLanguage ?? "zh-CN",
  );
  const [showManualProductId, setShowManualProductId] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const fetcher = useFetcher();
  const isSubmitting = fetcher.state === "submitting";
  const actionData = fetcher.data as
    | { success: true; taskId: string; batchId: string }
    | { success: false; errorMsg: string }
    | undefined;

  const search = location.search;

  useEffect(() => {
    setMounted(true);
  }, []);

  const runningCount = tasks.filter((task) => task.status === "running").length;

  const localeOptions = shopLocales?.localeOptions ?? [];

  const productIdForActions = (selectedProduct?.id ?? productId).trim();

  function handleTaskDeleted(taskId: string) {
    setTasks((prev) => prev.filter((task) => task.id !== taskId));
  }

  function handleTaskUpdated(
    taskId: string,
    status: AITaskItem["status"],
    result?: Record<string, unknown>,
  ) {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== taskId) return task;
        const completedAt =
          status !== "running" && !task.completedAt
            ? new Date().toISOString()
            : task.completedAt;
        return {
          ...task,
          status,
          result: result ?? task.result,
          completedAt,
          updatedAt: new Date().toISOString(),
        };
      }),
    );

    if (status === "running") return;

    void (async () => {
      try {
        const params = new URLSearchParams(
          search.startsWith("?") ? search.slice(1) : search,
        );
        params.set("taskId", taskId);
        const resp = await fetch(`/api/ai-task-detail?${params.toString()}`);
        if (!resp.ok) return;
        const body = (await resp.json()) as { task?: AITaskItem };
        if (!body.task) return;
        setTasks((prev) =>
          prev.map((task) => (task.id === taskId ? body.task! : task)),
        );
      } catch {
        // ignore; user can refresh manually
      }
    })();
  }

  const pendingSubmitRef = useRef<{
    productId: string;
    targetLanguage: string;
    originalTitle: string;
    estimatedCredits: number;
  } | null>(null);
  const lastHandledTaskIdRef = useRef<string | undefined>();

  function handleOpenConfirm() {
    if (!productIdForActions) {
      shopify.toast.show(t("productImproveStage1.toastSelectProduct"));
      return;
    }
    setConfirmOpen(true);
  }

  async function handleGenerateConfirmed() {
    if (!productIdForActions) return;
    pendingSubmitRef.current = {
      productId: productIdForActions,
      targetLanguage,
      originalTitle: selectedProduct?.title ?? "",
      estimatedCredits: ESTIMATED_TOKENS,
    };
    setConfirmOpen(false);
    setPageTab("tasks");
    fetcher.submit(
      { productId: productIdForActions, targetLanguage },
      { method: "POST", encType: "application/json" },
    );
  }

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;

    const data = fetcher.data as
      | { success: true; taskId: string; batchId: string }
      | { success: false; errorMsg: string };
    if (!data.success || !data.taskId || !data.batchId) return;
    if (data.taskId === lastHandledTaskIdRef.current) return;

    lastHandledTaskIdRef.current = data.taskId;
    const submitContext = pendingSubmitRef.current;
    pendingSubmitRef.current = null;

    const now = new Date().toISOString();
    const optimisticTask: AITaskItem = {
      id: data.taskId,
      batchId: data.batchId,
      shop: "",
      appName: "",
      taskType: "product_improve",
      status: "running",
      config: {
        productId: submitContext?.productId ?? "",
        targetLanguage: submitContext?.targetLanguage ?? targetLanguage,
        originalTitle: submitContext?.originalTitle ?? "",
        originalText: "",
      },
      result: null,
      estimatedCredits: submitContext?.estimatedCredits ?? ESTIMATED_TOKENS,
      actualCredits: null,
      startedAt: now,
      completedAt: null,
      errorMsg: null,
      createdAt: now,
      updatedAt: now,
    };

    setTasks((prev) => [optimisticTask, ...prev]);
    setPageTab("tasks");
    shopify.toast.show(t("productImproveStage1.toastTaskCreated"));
  }, [fetcher.data, fetcher.state, shopify, t, targetLanguage]);

  const errorText =
    actionData && !actionData.success ? actionData.errorMsg : null;

  const selectedName =
    selectedProduct?.title ??
    (productId ? t("productImproveStage1.productFallbackName", { id: productId }) : null);
  const selectedLanguageLabel =
    localeOptions.find((o) => o.value === targetLanguage)?.label ?? targetLanguage;

  const confirmSummaryItems = [
    { key: "target", label: t("productImproveStage1.confirmLabelTarget"), value: selectedName ?? "-" },
    { key: "language", label: t("productImproveStage1.taskLanguage"), value: selectedLanguageLabel },
    { key: "time", label: t("productImproveStage1.estimateTime"), value: ESTIMATED_DURATION },
    {
      key: "tokens",
      label: t("productImproveStage1.estimateCredits"),
      value: t("productImproveStage1.estimatedTokenValue", { count: ESTIMATED_TOKENS }),
    },
  ] as const;

  const billingBadge =
    billing.billingRequired && !billing.hasAccess ? (
      <span className="rounded-full bg-app-warning-subtle px-3 py-1 text-xs font-semibold text-app-warning">
        {t("generate.billingBadgeLow")}
      </span>
    ) : null;

  const configPanel = (
    <div className={sectionCardClassName}>
      <div className="mb-5">
        <div className="text-[18px] font-semibold text-app-text-primary">
          {t("productImproveStage1.configSurfaceTitle")}
        </div>
        <div className="mt-1 text-sm leading-6 text-app-text-secondary">
          {t("productImproveStage1.configSurfaceSubtitle")}
        </div>
      </div>

      <div className="space-y-4">
        <div className={subtlePanelClassName}>
          {mounted ? (
            <ProductSelector
              locationSearch={search}
              selected={selectedProduct}
              onSelectedChange={setSelectedProduct}
            />
          ) : (
            <div className="h-24 animate-pulse rounded-app-control bg-app-muted" aria-hidden />
          )}

          <details
            className="mt-3 rounded-app-control border border-app-subtle bg-app-subtle px-4 py-3"
            open={showManualProductId}
            onToggle={(e) => setShowManualProductId(e.currentTarget.open)}
          >
            <summary className="cursor-pointer text-sm font-medium text-app-text-secondary">
              {t("generate.advancedManualProductId")}
            </summary>
            <div className="pt-3">
              <label
                className="mb-2 block text-xs font-semibold tracking-[0.01em] text-app-text-secondary"
                htmlFor="manual-product-id"
              >
                {t("generate.productIdLabel")}
              </label>
              <input
                id="manual-product-id"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                autoComplete="off"
                disabled={isSubmitting}
                className="w-full rounded-app-control border border-app-subtle bg-app-card px-3 py-2 text-sm text-app-text-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          </details>
        </div>

        <div className={subtlePanelClassName}>
          <label
            className="mb-2 block text-xs font-semibold tracking-[0.01em] text-app-text-secondary"
            htmlFor="pi-target-lang"
          >
            {t("generate.targetLanguage")}
          </label>
          <select
            id="pi-target-lang"
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            disabled={isSubmitting}
            className="w-full rounded-app-control border border-app-subtle bg-app-subtle px-3 py-2 text-sm text-app-text-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {localeOptions.length === 0 && (
              <option value="zh-CN">Chinese (Simplified) (zh-CN)</option>
            )}
            {localeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="mt-2 text-xs leading-5 text-app-text-secondary">
            {t("productImproveStage1.targetLanguageHint")}
          </div>
        </div>

        {errorText ? (
          <div
            role="alert"
            className="rounded-app-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {errorText}
          </div>
        ) : null}

        <div className="rounded-app-control border border-app-subtle bg-app-subtle px-4 py-3 text-xs leading-5 text-app-text-footnote">
          {t("productImproveStage1.confirmFlowHint")}
        </div>

        <div className={subtlePanelClassName}>
          <button
            type="button"
            onClick={handleOpenConfirm}
            disabled={isSubmitting || !productIdForActions}
            className="rounded-app-control bg-app-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-app-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting
              ? t("productImproveStage1.submitting")
              : t("productImproveStage1.createTaskAction")}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <s-page heading={t("generate.pageTitle")}>
      <div style={pageContentStyle}>
        {billing.billingRequired && !billing.hasAccess ? (
          <s-banner tone="warning">
            {t("billing.lowBalanceWarning")}{" "}
            <s-link href={`/app/billing${search}`}>{t("billing.openBillingPage")}</s-link>
          </s-banner>
        ) : null}

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-app-text-primary">
              {t("generate.sectionTitle")}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-app-text-secondary">
              {t("productImproveStage1.subtitle")}
            </p>
          </div>
          {billingBadge}
        </div>

        <PageTabBar activeTab={pageTab} onTabChange={setPageTab} runningCount={runningCount} />

        {pageTab === "config" ? (mounted ? configPanel : (
          <div className="h-[28rem] animate-pulse rounded-app-card bg-app-muted" aria-hidden />
        )) : null}

        {pageTab === "tasks" && mounted ? (
          <ProductImproveTaskListPage
            tasks={tasks}
            locationSearch={search}
            onTaskDeleted={handleTaskDeleted}
            onTaskUpdated={handleTaskUpdated}
          />
        ) : null}

        {pageTab === "tasks" && !mounted ? (
          <div className="h-40 animate-pulse rounded-app-card bg-app-muted" aria-hidden />
        ) : null}

        <p style={pageTrustFootnoteStyle}>{t("generate.pageFootnote")}</p>
      </div>

      {mounted && confirmOpen ? (
        <Modal
          open={confirmOpen}
          onCancel={() => {
            if (!isSubmitting) setConfirmOpen(false);
          }}
          footer={null}
          className="spark-ant-modal"
          destroyOnHidden
          maskClosable={!isSubmitting}
          width={460}
          title={t("productImproveStage1.confirmDialogTitle")}
        >
          <div className="space-y-4">
            <p className="text-sm leading-6 text-app-text-secondary">
              {t("productImproveStage1.confirmDialogDesc")}
            </p>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {confirmSummaryItems.map((item) => (
                <div key={item.key} className="min-w-0">
                  <div className="text-[11px] text-app-text-secondary">{item.label}</div>
                  <div className="mt-0.5 break-words text-[13px] font-semibold text-app-text-primary">
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs leading-5 text-app-text-secondary">
              {t("productImproveStage1.confirmDialogFootnote")}
            </p>

            <Space wrap>
              <Button onClick={() => setConfirmOpen(false)} disabled={isSubmitting}>
                {t("common.cancel")}
              </Button>
              <Button type="primary" loading={isSubmitting} onClick={() => void handleGenerateConfirmed()}>
                {isSubmitting
                  ? t("productImproveStage1.submitting")
                  : t("productImproveStage1.confirmAndCreate")}
              </Button>
            </Space>
          </div>
        </Modal>
      ) : null}
    </s-page>
  );
}
