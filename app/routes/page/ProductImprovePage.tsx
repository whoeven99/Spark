import { useEffect, useRef, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { useFetcher, useLoaderData } from "react-router";
import type { loader } from "../app.product-improve";
import type { ProductSelectorSelection } from "../../lib/productSearchTypes";
import { LanguageSelector } from "../component/common/LanguageSelector";
import { ProductSelector } from "../component/product/ProductSelector";
import { ProductImproveTaskListPage } from "../component/productImprove/ProductImproveTaskListPage";
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
  pageTrustFootnoteStyle,
} from "./pageUiStyles";

type PageTab = "config" | "tasks";
const ESTIMATED_TOKENS = 320;
const ESTIMATED_DURATION = "1-2 min";
const footerRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.75rem",
  flexWrap: "wrap" as const,
};
const footerDividerStyle = {
  color: pageColorTokens.textFootnote,
};

export function ProductImprovePage() {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const loaderData = useLoaderData<typeof loader>();
  const billing = loaderData.billing;
  const [tasks, setTasks] = useState<AITaskItem[]>(loaderData.recentTasks);
  const [pageTab, setPageTab] = useState<PageTab>("config");

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

  const search =
    typeof window !== "undefined" ? window.location.search : "";

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
  const confirmDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = confirmDialogRef.current;
    if (!el) return;
    if (confirmOpen) {
      if (!el.open) {
        el.showModal();
      }
    } else if (el.open) {
      el.close();
    }
  }, [confirmOpen]);

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
          ariaLabel="商品优化页面导航"
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
                    {localeOptions.length === 0 && (
                      <option value="zh-CN">Chinese (Simplified) (zh-CN)</option>
                    )}
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

            <dialog
              ref={confirmDialogRef}
              onCancel={(e) => {
                e.preventDefault();
                if (!isSubmitting) {
                  setConfirmOpen(false);
                }
              }}
              style={{
                maxWidth: "460px",
                width: "calc(100% - 2rem)",
                padding: 0,
                border: "none",
                borderRadius: "12px",
                boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
              }}
            >
              <div style={{ padding: "1.125rem 1.25rem" }}>
                <div
                  style={{
                    fontSize: "1rem",
                    fontWeight: 700,
                    color: pageColorTokens.textPrimary,
                    marginBottom: "0.45rem",
                  }}
                >
                  {t("productImproveStage1.confirmDialogTitle")}
                </div>
                <div
                  style={{
                    fontSize: "0.8125rem",
                    color: pageColorTokens.textSecondary,
                    lineHeight: 1.5,
                    marginBottom: "0.9rem",
                  }}
                >
                  {t("productImproveStage1.confirmDialogDesc")}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "8px 16px",
                    marginBottom: "0.9rem",
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
                    marginBottom: "1rem",
                  }}
                >
                  {t("productImproveStage1.confirmDialogFootnote")}
                </div>
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
              </div>
            </dialog>
          </>
        )}

        {pageTab === "tasks" && (
          <ProductImproveTaskListPage
            tasks={tasks}
            locationSearch={search}
            onTaskDeleted={handleTaskDeleted}
            onTaskUpdated={handleTaskUpdated}
          />
        )}

        <div style={pageTrustFootnoteStyle}>
          <div style={footerRowStyle}>
            <LanguageSelector variant="inline" />
            <span aria-hidden="true" style={footerDividerStyle}>
              |
            </span>
            <span>
              Contact Us:{" "}
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
