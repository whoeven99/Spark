import { useEffect, useRef, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { useFetcher, useLoaderData, useLocation } from "react-router";
import type { loader } from "../app.product-improve";
import { formatEstimatedDuration } from "../../lib/formatDuration";
import type { ProductSelectorSelection } from "../../lib/productSearchTypes";
import { LanguageSelector } from "../component/common/LanguageSelector";
import { ProductSelector } from "../component/product/ProductSelector";
import { ProductImproveTaskListPage } from "../component/productImprove/ProductImproveTaskListPage";
import { DialogShell } from "../component/shared/DialogShell";
import { SegmentedPageTabs } from "../component/shared/SegmentedPageTabs";
import type { AITaskItem } from "../../lib/aiTaskTypes";
import {
  PageSectionHeader,
  PageSurface,
  formErrorBoxStyle,
  pageColorTokens,
  pageContentStyle,
  pageFieldLabelStyle,
  pageHintTextStyle,
  pageLinkHintStyle,
  pageSelectStyle,
} from "./pageUiStyles";

type PageTab = "config" | "tasks";

const footerDividerStyle = {
  color: pageColorTokens.textFootnote,
};
const footerDockStyle = {
  display: "flex",
  justifyContent: "center",
  width: "100%",
  marginTop: "0.5rem",
};
const footerContentStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.75rem",
  flexWrap: "wrap" as const,
  fontSize: "0.75rem",
  lineHeight: 1.45,
  color: pageColorTokens.textSecondary,
  textAlign: "center" as const,
};

function readPageTabFromSearch(search: string): PageTab {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("tab") ===
    "tasks"
    ? "tasks"
    : "config";
}

function buildSearchWithoutTab(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.delete("tab");
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export function ProductImprovePage() {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const loaderData = useLoaderData<typeof loader>();
  const location = useLocation();
  const billing = loaderData.billing;
  const ewmaCredits = loaderData.estimatedCredits;
  const ewmaSeconds = loaderData.estimatedSeconds ?? null;
  const estimatedDuration = formatEstimatedDuration(ewmaSeconds, t);
  const [tasks, setTasks] = useState<AITaskItem[]>(loaderData.initialTaskPage.tasks);
  const [taskMetrics, setTaskMetrics] = useState(loaderData.initialTaskPage.metrics);
  const [pageTab, setPageTabState] = useState<PageTab>(() =>
    readPageTabFromSearch(
      typeof window !== "undefined" ? window.location.search : location.search,
    ),
  );

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

  const search = buildSearchWithoutTab(location.search);

  function setPageTab(nextTab: PageTab) {
    setPageTabState(nextTab);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (nextTab === "config") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", nextTab);
    }
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }

  useEffect(() => {
    setPageTabState(readPageTabFromSearch(location.search));
  }, [location.search]);

  const runningCount = taskMetrics.runningCount;
  const taskPageSize = loaderData.initialTaskPage.pageSize;

  const localeOptions = shopLocales?.localeOptions ?? [];

  const productIdForActions = (selectedProduct?.id ?? productId).trim();

  function handleTaskDeleted(task: AITaskItem) {
    const isCurrentTask =
      new Date(task.createdAt).getTime() >= Date.now() - 24 * 60 * 60 * 1000;

    setTasks((prev) => prev.filter((item) => item.id !== task.id));
    setTaskMetrics((prev) => ({
      currentCount: Math.max(prev.currentCount - (isCurrentTask ? 1 : 0), 0),
      historyCount: Math.max(prev.historyCount - (isCurrentTask ? 0 : 1), 0),
      runningCount: Math.max(prev.runningCount - (task.status === "running" ? 1 : 0), 0),
      totalCount: Math.max(prev.totalCount - 1, 0),
    }));
  }

  function handleTaskUpdated(
    taskId: string,
    status: AITaskItem["status"],
    result?: Record<string, unknown>,
  ) {
    let runningDelta = 0;
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== taskId) return task;
        if (task.status === "running" && status !== "running") {
          runningDelta = -1;
        } else if (task.status !== "running" && status === "running") {
          runningDelta = 1;
        }
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
    if (runningDelta !== 0) {
      setTaskMetrics((prev) => ({
        ...prev,
        runningCount: Math.max(prev.runningCount + runningDelta, 0),
      }));
    }

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
      estimatedCredits: ewmaCredits,
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
      | { success: true; taskId: string; batchId: string; sourceLanguage?: string; brandStyle?: string }
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
        itemCount: 1,
        sourceLanguage: data.sourceLanguage ?? "",
        brandStyle: data.brandStyle ?? "",
      },
      result: null,
      estimatedCredits: submitContext?.estimatedCredits ?? ewmaCredits,
      actualCredits: null,
      startedAt: now,
      completedAt: null,
      errorMsg: null,
      createdAt: now,
      updatedAt: now,
    };

    setTasks((prev) => [optimisticTask, ...prev.filter((task) => task.id !== optimisticTask.id)].slice(0, taskPageSize));
    setTaskMetrics((prev) => ({
      currentCount: prev.currentCount + 1,
      historyCount: prev.historyCount,
      runningCount: prev.runningCount + 1,
      totalCount: prev.totalCount + 1,
    }));
    setPageTab("tasks");
    shopify.toast.show(t("productImproveStage1.toastTaskCreated"));
  }, [fetcher.data, fetcher.state, shopify, t, targetLanguage, taskPageSize]);

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
    {
      key: "time",
      label: t("productImproveStage1.estimateTime"),
      value: estimatedDuration,
    },
    {
      key: "tokens",
      label: t("productImproveStage1.estimateCredits"),
      value: t("productImproveStage1.estimatedTokenValue", { count: ewmaCredits }),
    },
  ] as const;

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
        />

        <SegmentedPageTabs
          activeTab={pageTab}
          onTabChange={setPageTab}
          ariaLabel={t("productImproveStage1.pageNavAriaLabel")}
          items={[
            { key: "config", label: t("productImproveStage1.tabsConfig") },
            { key: "tasks", label: t("productImproveStage1.tabsTasks"), badgeCount: runningCount },
          ]}
          style={{ margin: "0 0 20px" }}
        />

        {pageTab === "config" && (
          <>
            <PageSurface
              title={t("productImproveStage1.configSurfaceTitle")}
              subtitle={t("productImproveStage1.configSurfaceSubtitle")}
            >
              <s-stack direction="block" gap="base">
                <ProductSelector
                  locationSearch={search}
                  selected={selectedProduct}
                  onSelectedChange={setSelectedProduct}
                />

                <details
                  style={{
                    marginTop: "0.25rem",
                    padding: "0.85rem 0.95rem",
                    borderRadius: pageColorTokens.radiusControl,
                    background: pageColorTokens.surfaceSubtle,
                    border: `1px solid ${pageColorTokens.borderSubtle}`,
                  }}
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
                  <label htmlFor="pi-target-lang" style={pageFieldLabelStyle}>
                    {t("generate.targetLanguage")}
                  </label>
                  <select
                    id="pi-target-lang"
                    value={targetLanguage}
                    onChange={(e) => setTargetLanguage(e.target.value)}
                    disabled={isSubmitting}
                    style={pageSelectStyle(isSubmitting)}
                  >
                    {localeOptions.length === 0 && <option value={targetLanguage}>{targetLanguage}</option>}
                    {localeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <div style={pageHintTextStyle}>
                    {t("productImproveStage1.targetLanguageHint")}
                  </div>
                </div>

                {errorText ? <div style={formErrorBoxStyle}>{errorText}</div> : null}

                <div
                  style={{
                    fontSize: 12,
                    color: pageColorTokens.textFootnote,
                    padding: "0.75rem 0.85rem",
                    borderRadius: pageColorTokens.radiusControl,
                    background: pageColorTokens.surfaceSubtle,
                    border: `1px solid ${pageColorTokens.borderSubtle}`,
                  }}
                >
                  {t("productImproveStage1.confirmFlowHint")}
                </div>

                <s-stack direction="inline" gap="small">
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={handleOpenConfirm}
                    {...(isSubmitting || !productIdForActions ? { disabled: true } : {})}
                  >
                    {isSubmitting
                      ? t("productImproveStage1.submitting")
                      : t("productImproveStage1.createTaskAction")}
                  </s-button>
                </s-stack>
              </s-stack>
            </PageSurface>

            <DialogShell
              open={confirmOpen}
              width={460}
              closeDisabled={isSubmitting}
              onClose={() => setConfirmOpen(false)}
              title={t("productImproveStage1.confirmDialogTitle")}
              description={t("productImproveStage1.confirmDialogDesc")}
              footer={
                <s-stack direction="inline" gap="small">
                  <s-button
                    type="button"
                    variant="secondary"
                    onClick={() => setConfirmOpen(false)}
                    {...(isSubmitting ? { disabled: true } : {})}
                  >
                    {t("common.cancel")}
                  </s-button>
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={() => void handleGenerateConfirmed()}
                    {...(isSubmitting ? { disabled: true } : {})}
                  >
                    {isSubmitting
                      ? t("productImproveStage1.submitting")
                      : t("productImproveStage1.confirmAndCreate")}
                  </s-button>
                </s-stack>
              }
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "8px 16px",
                }}
              >
                {confirmSummaryItems.map((item) => (
                  <div key={item.key} style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "0.6875rem", color: pageColorTokens.textSecondary }}>
                      {item.label}
                    </div>
                    <div
                      style={{
                        fontSize: "0.8125rem",
                        color: pageColorTokens.textPrimary,
                        fontWeight: 600,
                        marginTop: 3,
                        wordBreak: "break-word",
                      }}
                    >
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: pageColorTokens.textSecondary,
                  lineHeight: 1.5,
                }}
              >
                {t("productImproveStage1.confirmDialogFootnote")}
              </div>
            </DialogShell>
          </>
        )}

        {pageTab === "tasks" && (
          <ProductImproveTaskListPage
            initialPageData={loaderData.initialTaskPage}
            tasks={tasks}
            taskMetrics={taskMetrics}
            locationSearch={search}
            onTaskDeleted={handleTaskDeleted}
            onTaskUpdated={handleTaskUpdated}
          />
        )}

        <div style={footerDockStyle}>
          <div style={footerContentStyle}>
            <LanguageSelector variant="inline" />
            <span aria-hidden="true" style={footerDividerStyle}>
              |
            </span>
            <span>
              {t("productImproveStage1.contactUsLabel")}{" "}
              <a href="mailto:support@ciwi.ai" style={{ color: "inherit" }}>
                support@ciwi.ai
              </a>
            </span>
          </div>
        </div>
      </div>
    </s-page>
  );
}
