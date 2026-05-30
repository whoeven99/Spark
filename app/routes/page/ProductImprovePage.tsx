import { useEffect, useRef, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { useFetcher, useLoaderData } from "react-router";
import { Alert, Button, Card, Collapse, Input, Modal, Select, Space, Tabs, Tag } from "antd";
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
  "spark-ant-card rounded-app-card border border-app-subtle bg-app-card shadow-app-card";
const subtlePanelClassName = "rounded-app-control border border-app-subtle bg-app-subtle p-4";

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
      <Tag
        bordered={false}
        className="m-0 rounded-full bg-app-warning-subtle px-3 py-1 text-app-warning"
      >
        {t("generate.billingBadgeLow")}
      </Tag>
    ) : null;

  return (
    <s-page heading={t("generate.pageTitle")}>
      <div style={pageContentStyle}>
        {billing.billingRequired && !billing.hasAccess ? (
          <Alert
            type="warning"
            showIcon
            message={
              <span>
                {t("billing.lowBalanceWarning")}{" "}
                <a
                  href={`/app/billing${search}`}
                  className="font-semibold text-app-primary underline-offset-2 hover:underline"
                >
                  {t("billing.openBillingPage")}
                </a>
              </span>
            }
          />
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

        <div className="rounded-full border border-app-subtle bg-app-muted p-1">
          <Tabs
            activeKey={pageTab}
            onChange={(key) => setPageTab(key as PageTab)}
            className="spark-ant-tabs"
            destroyOnHidden
            items={[
              {
                key: "config",
                label: t("productImproveStage1.tabsConfig"),
                children: (
                  <Card className={sectionCardClassName}>
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
                                    disabled={isSubmitting}
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
                          htmlFor="pi-target-lang"
                        >
                          {t("generate.targetLanguage")}
                        </label>
                        <Select
                          id="pi-target-lang"
                          value={targetLanguage || undefined}
                          className="w-full"
                          placeholder={t("generate.targetLanguage")}
                          onChange={(value) => setTargetLanguage(value)}
                          disabled={isSubmitting}
                          options={
                            localeOptions.length > 0
                              ? localeOptions.map((opt) => ({
                                  value: opt.value,
                                  label: opt.label,
                                }))
                              : [{ value: "zh-CN", label: "Chinese (Simplified) (zh-CN)" }]
                          }
                          showSearch
                          optionFilterProp="label"
                        />
                        <div className="mt-2 text-xs leading-5 text-app-text-secondary">
                          {t("productImproveStage1.targetLanguageHint")}
                        </div>
                      </div>

                      {errorText ? (
                        <Alert type="error" showIcon className="rounded-app-card" message={errorText} />
                      ) : null}

                      <div className="rounded-app-control border border-app-subtle bg-app-subtle px-4 py-3 text-xs leading-5 text-app-text-footnote">
                        {t("productImproveStage1.confirmFlowHint")}
                      </div>

                      <div className={subtlePanelClassName}>
                        <Space wrap size="middle">
                          <Button
                            type="primary"
                            onClick={handleOpenConfirm}
                            loading={isSubmitting}
                            disabled={!productIdForActions}
                          >
                            {isSubmitting
                              ? t("productImproveStage1.submitting")
                              : t("productImproveStage1.createTaskAction")}
                          </Button>
                        </Space>
                      </div>
                    </div>
                  </Card>
                ),
              },
              {
                key: "tasks",
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    {t("productImproveStage1.tabsTasks")}
                    {runningCount > 0 ? (
                      <Tag
                        bordered={false}
                        className="m-0 rounded-full bg-app-primary px-2 py-0 text-[11px] font-bold text-white"
                      >
                        {runningCount}
                      </Tag>
                    ) : null}
                  </span>
                ),
                children: (
                  <div className="space-y-4">
                    <p className="text-sm text-app-text-secondary">
                      {t("productImproveStage1.taskListSubtitle")}
                    </p>
                    <ProductImproveTaskListPage
                      tasks={tasks}
                      locationSearch={search}
                      onTaskDeleted={handleTaskDeleted}
                      onTaskUpdated={handleTaskUpdated}
                    />
                  </div>
                ),
              },
            ]}
          />
        </div>

        <p style={pageTrustFootnoteStyle}>{t("generate.pageFootnote")}</p>
      </div>

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
    </s-page>
  );
}
