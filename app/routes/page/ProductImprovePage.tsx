import { useEffect, useRef, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { useFetcher, useLoaderData } from "react-router";
import type { loader } from "../app.product-improve";
import type { ProductSelectorSelection } from "../../lib/productSearchTypes";
import { ProductSelector } from "../component/product/ProductSelector";
import { ProductImproveTaskListPage } from "../component/productImprove/ProductImproveTaskListPage";
import { TaskListSummary } from "../component/aiTask/TaskListSummary";
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
  twoColumnLayoutStyle,
  twoColumnMainStyle,
  twoColumnSideStyle,
} from "./pageUiStyles";

type PageTab = "config" | "tasks";

function PageTabBar({
  activeTab,
  onTabChange,
  runningCount,
}: {
  activeTab: PageTab;
  onTabChange: (tab: PageTab) => void;
  runningCount: number;
}) {
  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: "9px 16px",
    borderRadius: 999,
    border: `1px solid ${active ? pageColorTokens.borderSubtle : "transparent"}`,
    background: active ? pageColorTokens.surface : "transparent",
    color: active ? pageColorTokens.textPrimary : pageColorTokens.textSecondary,
    boxShadow: active ? pageColorTokens.shadowCard : "none",
    fontWeight: active ? 700 : 600,
    fontSize: 14,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  });

  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        alignItems: "center",
        background: pageColorTokens.surfaceMuted,
        border: `1px solid ${pageColorTokens.borderSubtle}`,
        borderRadius: 999,
        padding: "5px",
        marginBottom: 20,
        boxShadow: "inset 0 1px 2px rgba(0,0,0,0.03)",
        flexWrap: "wrap",
      }}
    >
      <button type="button" style={btnStyle(activeTab === "config")} onClick={() => onTabChange("config")}>
        配置页
      </button>
      <button type="button" style={btnStyle(activeTab === "tasks")} onClick={() => onTabChange("tasks")}>
        任务列表
        {runningCount > 0 && (
          <span
            style={{
              background: pageColorTokens.brandGreen,
              color: "#fff",
              borderRadius: 10,
              padding: "1px 8px",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {runningCount}
          </span>
        )}
      </button>
      {activeTab === "tasks" && (
        <span
          style={{
            fontSize: 13,
            color: pageColorTokens.textSecondary,
            marginLeft: 8,
            padding: "0.35rem 0.75rem",
            borderRadius: 999,
            background: pageColorTokens.surface,
            border: `1px solid ${pageColorTokens.borderSubtle}`,
          }}
        >
          执行中、待审查、已应用和评分结果统一在这里查看。
        </span>
      )}
    </div>
  );
}

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

  const fetcher = useFetcher();
  const isSubmitting = fetcher.state === "submitting";
  const actionData = fetcher.data as
    | { success: true; taskId: string; batchId: string }
    | { success: false; errorMsg: string }
    | undefined;

  const search =
    typeof window !== "undefined" ? window.location.search : "";

  const runningCount = tasks.filter((t) => t.status === "running").length;

  const localeOptions = shopLocales?.localeOptions ?? [];

  const productIdForActions = (selectedProduct?.id ?? productId).trim();

  function handleTaskDeleted(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
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
  } | null>(null);
  const lastHandledTaskIdRef = useRef<string | undefined>();

  async function handleGenerate() {
    if (!productIdForActions) {
      shopify.toast.show("请先选择或输入商品 ID");
      return;
    }
    pendingSubmitRef.current = {
      productId: productIdForActions,
      targetLanguage,
      originalTitle: selectedProduct?.title ?? "",
    };
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
      estimatedCredits: null,
      actualCredits: null,
      startedAt: now,
      completedAt: null,
      errorMsg: null,
      createdAt: now,
      updatedAt: now,
    };

    setTasks((prev) => [optimisticTask, ...prev]);
    setPageTab("tasks");
    shopify.toast.show("文案生成任务已创建，请在任务列表中查看进度");
  }, [fetcher.data, fetcher.state, shopify, targetLanguage]);

  const errorText =
    actionData && !actionData.success ? actionData.errorMsg : null;

  // Estimate panel values
  const selectedName = selectedProduct?.title ?? (productId ? `商品 ${productId}` : null);

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
          subtitle="在配置页发起任务，并在任务列表中完成审查与写入。"
        />

        <PageTabBar
          activeTab={pageTab}
          onTabChange={setPageTab}
          runningCount={runningCount}
        />

        {pageTab === "config" && (
          <>
            {/* Task summary always visible in config tab */}
            <TaskListSummary tasks={tasks} mode="product_improve" />

            {/* Generation form + estimate panel */}
            <div style={twoColumnLayoutStyle}>
              <div style={twoColumnMainStyle}>
                <PageSurface title="生成配置" subtitle="选择商品与目标语言后点击生成">
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
                        语言用于控制生成语气和输出结果，发起任务后可在任务列表中继续审查。
                      </div>
                    </div>

                    {errorText ? <div style={formErrorBoxStyle}>{errorText}</div> : null}
                  </s-stack>
                </PageSurface>
              </div>

              <div style={twoColumnSideStyle}>
                <PageSurface title="执行前预估" subtitle="确认影响范围、预估耗时和预估 Token 后开始生成。">
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                      marginBottom: 16,
                    }}
                  >
                    {[
                      { label: "商品", value: selectedName ?? "-" },
                      {
                        label: "目标语言",
                        value:
                          localeOptions.find((o) => o.value === targetLanguage)?.label ??
                          targetLanguage,
                      },
                      { label: "预估耗时", value: "1–2 min" },
                      { label: "预估 Token", value: "320 Token" },
                    ].map((item) => (
                      <div
                        key={item.label}
                        style={{
                          border: `1px solid ${pageColorTokens.borderSubtle}`,
                          borderRadius: pageColorTokens.radiusControl,
                          padding: "10px 12px",
                          background: pageColorTokens.surfaceSubtle,
                          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            color: pageColorTokens.textSecondary,
                            marginBottom: 4,
                          }}
                        >
                          {item.label}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: pageColorTokens.textPrimary,
                            wordBreak: "break-word",
                          }}
                        >
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  <s-stack direction="inline" gap="small">
                    <s-button
                      type="button"
                      variant="primary"
                      onClick={() => void handleGenerate()}
                      {...(isSubmitting || !productIdForActions ? { disabled: true } : {})}
                    >
                      {isSubmitting ? "提交中..." : "生成文案"}
                    </s-button>
                  </s-stack>

                  <div
                    style={{
                      marginTop: 14,
                      fontSize: 12,
                      color: pageColorTokens.textFootnote,
                      padding: "0.75rem 0.85rem",
                      borderRadius: pageColorTokens.radiusControl,
                      background: pageColorTokens.surfaceSubtle,
                      border: `1px solid ${pageColorTokens.borderSubtle}`,
                    }}
                  >
                    生成将消耗 Token；保存至 Shopify 前可在任务列表预览并编辑标题与描述。
                  </div>
                </PageSurface>
              </div>
            </div>
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

        <p style={pageTrustFootnoteStyle}>{t("generate.pageFootnote")}</p>
      </div>
    </s-page>
  );
}
