import { useAppBridge } from "@shopify/app-bridge-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLoaderData, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { useImageGeneration } from "../../hooks/useImageGeneration";
import type { AITaskItem, AITaskType } from "../../lib/aiTaskTypes";
import type { ImageStudioPageLoaderData } from "../../server/visualTools/imageStudioPageLoader.server";
import { ImageGenerationForm } from "../component/imageGeneration/ImageGenerationForm";
import { PictureTranslateForm } from "../component/pictureTranslate/PictureTranslateForm";
import { PictureTranslateProvider } from "../component/pictureTranslate/pictureTranslateContext";
import { usePictureTranslateContext } from "../component/pictureTranslate/pictureTranslateContext";
import { SegmentedPageTabs } from "../component/shared/SegmentedPageTabs";
import { DialogShell } from "../component/shared/DialogShell";
import type { VisualToolsTab } from "../component/visualTools/VisualToolsTabBar";
import { VisualToolsTabBar } from "../component/visualTools/VisualToolsTabBar";
import { TaskListSummary } from "../component/aiTask/TaskListSummary";
import { ImageStudioTaskListPage } from "../component/imageStudio/ImageStudioTaskListPage";
import {
  PageSectionHeader,
  PageSurface,
  formErrorBoxStyle,
  pageColorTokens,
  pageContentStyle,
  pageTrustFootnoteStyle,
} from "./pageUiStyles";

type PageTab = "config" | "tasks";

function readToolFromSearch(search: string): VisualToolsTab {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const tool = params.get("tool");
  if (tool === "translate" || tool === "generate") return tool;
  const legacyTab = params.get("tab");
  return legacyTab === "translate" ? "translate" : "generate";
}

function readViewFromSearch(search: string): PageTab {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("view") ===
    "tasks"
    ? "tasks"
    : "config";
}

function syncInternalSearch(next: { tool: VisualToolsTab; view: PageTab }) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("tool", next.tool);
  url.searchParams.delete("tab");
  if (next.view === "config") {
    url.searchParams.delete("view");
  } else {
    url.searchParams.set("view", next.view);
  }
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function buildOptimisticTask(params: {
  taskId: string;
  batchId: string;
  taskType: AITaskType;
  optimisticConfig?: Record<string, unknown>;
}): AITaskItem {
  const now = new Date().toISOString();
  return {
    id: params.taskId,
    batchId: params.batchId,
    shop: "",
    appName: "",
    taskType: params.taskType,
    status: "running",
    config: params.optimisticConfig ?? {},
    result: null,
    estimatedCredits: null,
    actualCredits: null,
    startedAt: now,
    completedAt: null,
    errorMsg: null,
    createdAt: now,
    updatedAt: now,
  };
}

type InnerProps = {
  tasks: AITaskItem[];
  pageTab: PageTab;
  setPageTab: (tab: PageTab) => void;
  locationSearch: string;
  onTaskCreated: (
    taskId: string,
    batchId: string,
    taskType: AITaskType,
    optimisticConfig?: Record<string, unknown>,
  ) => void;
  onTaskDeleted: (taskId: string) => void;
  onTaskUpdated: (taskId: string, status: AITaskItem["status"], result?: Record<string, unknown>) => void;
};

function ImageStudioPageInner({
  tasks,
  pageTab,
  setPageTab,
  locationSearch,
  onTaskCreated,
  onTaskDeleted,
  onTaskUpdated,
}: InnerProps) {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const location = useLocation();
  const pictureTranslate = usePictureTranslateContext();
  const [activeToolTab, setActiveToolTabState] = useState<VisualToolsTab>(() =>
    readToolFromSearch(typeof window !== "undefined" ? window.location.search : location.search),
  );
  const [generateConfirmOpen, setGenerateConfirmOpen] = useState(false);
  const [translateConfirmOpen, setTranslateConfirmOpen] = useState(false);

  const setActiveToolTab = useCallback(
    (tab: VisualToolsTab) => {
      setActiveToolTabState(tab);
      syncInternalSearch({ tool: tab, view: pageTab });
    },
    [pageTab],
  );

  const toastShow = useCallback(
    (message: string) => shopify.toast.show(message),
    [shopify],
  );

  const imageGen = useImageGeneration({
    locationSearch,
    toastShow,
    onTaskCreated,
  });

  useEffect(() => {
    setActiveToolTabState(readToolFromSearch(location.search));
  }, [location.search]);

  useEffect(() => {
    syncInternalSearch({ tool: activeToolTab, view: pageTab });
  }, [activeToolTab, pageTab]);

  const runningCount = tasks.filter((t) => t.status === "running").length;
  const sectionSubtitle =
    activeToolTab === "translate"
      ? t("pictureTranslate.pageSubtitle")
      : t("imageGeneration.pageSubtitle");

  const translateDraft = useMemo(() => {
    const trimmedImageUrl = pictureTranslate.imageUrl.trim();
    const sourceSummary =
      pictureTranslate.selectedSource === "product"
        ? pictureTranslate.selectedProduct?.title || trimmedImageUrl || t("common.unknown")
        : pictureTranslate.selectedSource === "url"
          ? trimmedImageUrl || t("common.unknown")
          : pictureTranslate.imageFileName || t("common.unknown");

    return {
      sourceSummary,
      sourceLanguage: pictureTranslate.sourceLanguage,
      targetLanguage: pictureTranslate.targetLanguage,
      sourceType: pictureTranslate.selectedSource,
      estimatedDuration: t("imageStudio.estimatedTranslateDuration"),
    };
  }, [
    pictureTranslate.imageFileName,
    pictureTranslate.imageUrl,
    pictureTranslate.selectedProduct?.title,
    pictureTranslate.selectedSource,
    pictureTranslate.sourceLanguage,
    pictureTranslate.targetLanguage,
    t,
  ]);

  function handleOpenGenerateConfirm() {
    if (!imageGen.prepareSubmit()) return;
    setGenerateConfirmOpen(true);
  }

  function handleOpenTranslateConfirm() {
    if (!pictureTranslate.prepareSubmit()) return;
    setTranslateConfirmOpen(true);
  }

  return (
    <s-page heading={t("imageStudio.pageTitle")}>
      <div style={pageContentStyle}>
        <PageSectionHeader
          title={t("imageStudio.sectionTitle")}
          subtitle={t("imageStudio.pageSubtitle")}
        />

        <SegmentedPageTabs
          activeTab={pageTab}
          onTabChange={setPageTab}
          ariaLabel={t("imageStudio.pageNavAriaLabel")}
          items={[
            { key: "config", label: t("imageStudio.tabsConfig") },
            { key: "tasks", label: t("imageStudio.tabsTasks"), badgeCount: runningCount },
          ]}
          style={{ margin: "0 0 20px" }}
        />

        {pageTab === "config" && (
          <>
            {/* Task summary always visible in config tab */}
            <TaskListSummary tasks={tasks} mode="image" />

            <VisualToolsTabBar
              activeTab={activeToolTab}
              onTabChange={setActiveToolTab}
            />
            <div style={{ marginTop: 16 }}>
              <PageSurface
                title={
                  activeToolTab === "translate"
                    ? t("pictureTranslate.sectionConfig")
                    : t("imageGeneration.sectionConfig")
                }
                subtitle={sectionSubtitle}
              >
                {activeToolTab === "generate" ? (
                  <ImageGenerationForm
                    description={imageGen.description}
                    onDescriptionChange={imageGen.setDescription}
                    descriptionErrorText={imageGen.descriptionErrorText}
                    busy={imageGen.isSubmitting}
                    isSubmitting={imageGen.isSubmitting}
                    onGenerateImage={handleOpenGenerateConfirm}
                  />
                ) : (
                  <PictureTranslateForm variant="page" onSubmit={handleOpenTranslateConfirm} />
                )}
              </PageSurface>
            </div>
          </>
        )}

        {pageTab === "tasks" && (
          <ImageStudioTaskListPage
            tasks={tasks}
            locationSearch={locationSearch}
            onTaskDeleted={onTaskDeleted}
            onTaskUpdated={onTaskUpdated}
          />
        )}

        <p style={pageTrustFootnoteStyle}>
          {activeToolTab === "translate"
            ? t("pictureTranslate.pageFootnote")
            : t("imageGeneration.pageFootnote")}
        </p>
      </div>

      <DialogShell
        open={generateConfirmOpen}
        width={460}
        closeDisabled={imageGen.isSubmitting}
        onClose={() => setGenerateConfirmOpen(false)}
        title={t("imageStudio.confirmGenerateTitle")}
        description={t("imageStudio.confirmGenerateDescription")}
        footer={
          <s-stack direction="inline" gap="small">
            <s-button
              type="button"
              variant="secondary"
              onClick={() => setGenerateConfirmOpen(false)}
              {...(imageGen.isSubmitting ? { disabled: true } : {})}
            >
              {t("common.cancel")}
            </s-button>
            <s-button
              type="button"
              variant="primary"
              onClick={() => {
                setGenerateConfirmOpen(false);
                setPageTab("tasks");
                void imageGen.submitGenerate();
              }}
              {...(imageGen.isSubmitting ? { disabled: true } : {})}
            >
              {imageGen.isSubmitting ? t("imageGeneration.submitting") : t("imageStudio.confirmAndCreate")}
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
          {[
            {
              key: "target",
              label: t("imageStudio.confirmLabelTarget"),
              value: t("imageStudio.taskGoalGenerate"),
            },
            {
              key: "input",
              label: t("imageStudio.confirmLabelInput"),
              value: imageGen.description.trim(),
            },
            {
              key: "time",
              label: t("imageStudio.confirmLabelTime"),
              value: t("imageStudio.estimatedGenerateDuration"),
            },
            {
              key: "credit",
              label: t("imageStudio.confirmLabelCredits"),
              value: t("imageStudio.estimatedCreditsPending"),
            },
          ].map((item) => (
            <div key={item.key} style={{ minWidth: 0 }}>
              <div style={{ fontSize: "0.6875rem", color: pageColorTokens.textSecondary }}>{item.label}</div>
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
      </DialogShell>

      <DialogShell
        open={translateConfirmOpen}
        width={460}
        closeDisabled={pictureTranslate.isSubmitting}
        onClose={() => setTranslateConfirmOpen(false)}
        title={t("imageStudio.confirmTranslateTitle")}
        description={t("imageStudio.confirmTranslateDescription")}
        footer={
          <s-stack direction="inline" gap="small">
            <s-button
              type="button"
              variant="secondary"
              onClick={() => setTranslateConfirmOpen(false)}
              {...(pictureTranslate.isSubmitting ? { disabled: true } : {})}
            >
              {t("common.cancel")}
            </s-button>
            <s-button
              type="button"
              variant="primary"
              onClick={() => {
                setTranslateConfirmOpen(false);
                setPageTab("tasks");
                void pictureTranslate.submitTranslate();
              }}
              {...(pictureTranslate.isSubmitting ? { disabled: true } : {})}
            >
              {pictureTranslate.isSubmitting ? t("pictureTranslate.submitting") : t("imageStudio.confirmAndCreate")}
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
          {[
            {
              key: "target",
              label: t("imageStudio.confirmLabelTarget"),
              value: t("imageStudio.taskGoalTranslate"),
            },
            {
              key: "input",
              label: t("imageStudio.confirmLabelInput"),
              value: translateDraft.sourceSummary,
            },
            {
              key: "language",
              label: t("pictureTranslate.targetLanguage"),
              value: t("imageStudio.taskLanguageDirection", {
                source: translateDraft.sourceLanguage,
                target: translateDraft.targetLanguage,
              }),
            },
            {
              key: "time",
              label: t("imageStudio.confirmLabelTime"),
              value: translateDraft.estimatedDuration,
            },
          ].map((item) => (
            <div key={item.key} style={{ minWidth: 0 }}>
              <div style={{ fontSize: "0.6875rem", color: pageColorTokens.textSecondary }}>{item.label}</div>
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
        {pictureTranslate.selectedSource === "upload" ? (
          <div style={{ ...formErrorBoxStyle, marginTop: "0.75rem" }}>
            {t("imageStudio.uploadNotSupportedYet")}
          </div>
        ) : null}
      </DialogShell>
    </s-page>
  );
}

export function ImageStudioPage() {
  const shopify = useAppBridge();
  const loaderData = useLoaderData<ImageStudioPageLoaderData>();
  const locationSearch =
    typeof window !== "undefined" ? window.location.search : "";

  const [tasks, setTasks] = useState<AITaskItem[]>(() => [
    ...loaderData.imageGenTasks,
    ...loaderData.translateTasks,
  ]);
  const location = useLocation();
  const [pageTab, setPageTabState] = useState<PageTab>(() =>
    readViewFromSearch(typeof window !== "undefined" ? window.location.search : location.search),
  );

  useEffect(() => {
    setPageTabState(readViewFromSearch(location.search));
  }, [location.search]);

  const setPageTab = useCallback((tab: PageTab) => {
    setPageTabState(tab);
    syncInternalSearch({
      tool: readToolFromSearch(typeof window !== "undefined" ? window.location.search : location.search),
      view: tab,
    });
  }, [location.search]);

  const handleTaskCreated = useCallback(
    (
      taskId: string,
      batchId: string,
      taskType: AITaskType = "image_generation",
      optimisticConfig?: Record<string, unknown>,
    ) => {
      const optimisticTask = buildOptimisticTask({
        taskId,
        batchId,
        taskType,
        optimisticConfig,
      });
      setTasks((prev) => [optimisticTask, ...prev]);
      setPageTab("tasks");
    },
    [],
  );

  const handleTaskDeleted = useCallback((taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  const handleTaskUpdated = useCallback(
    (taskId: string, status: AITaskItem["status"], result?: Record<string, unknown>) => {
      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId
            ? {
                ...task,
                status,
                result: result ?? task.result,
                completedAt:
                  status !== "running" && !task.completedAt ? new Date().toISOString() : task.completedAt,
                updatedAt: new Date().toISOString(),
              }
            : task,
        ),
      );
    },
    [],
  );

  return (
    <PictureTranslateProvider
      mode="page"
      locationSearch={locationSearch}
      toastShow={(message) => shopify.toast.show(message)}
      onTaskCreated={handleTaskCreated}
    >
      <ImageStudioPageInner
        tasks={tasks}
        pageTab={pageTab}
        setPageTab={setPageTab}
        locationSearch={locationSearch}
        onTaskCreated={handleTaskCreated}
        onTaskDeleted={handleTaskDeleted}
        onTaskUpdated={handleTaskUpdated}
      />
    </PictureTranslateProvider>
  );
}
