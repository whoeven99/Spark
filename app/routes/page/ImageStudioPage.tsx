import { useAppBridge } from "@shopify/app-bridge-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLoaderData, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { useImageGeneration } from "../../hooks/useImageGeneration";
import type { AITaskItem, AITaskType } from "../../lib/aiTaskTypes";
import type { ImageStudioPageLoaderData } from "../../server/visualTools/imageStudioPageLoader.server";
import { LanguageSelector } from "../component/common/LanguageSelector";
import { ImageGenerationForm } from "../component/imageGeneration/ImageGenerationForm";
import { PictureTranslateForm } from "../component/pictureTranslate/PictureTranslateForm";
import { PictureTranslateProvider } from "../component/pictureTranslate/pictureTranslateContext";
import { usePictureTranslateContext } from "../component/pictureTranslate/pictureTranslateContext";
import { SegmentedPageTabs } from "../component/shared/SegmentedPageTabs";
import { DialogShell } from "../component/shared/DialogShell";
import { ImageStudioTaskListPage } from "../component/imageStudio/ImageStudioTaskListPage";
import {
  PageSectionHeader,
  PageSurface,
  formErrorBoxStyle,
  pageColorTokens,
  pageContentStyle,
} from "./pageUiStyles";

type VisualToolsTab = "generate" | "translate";
type StudioNavTab = VisualToolsTab | "tasks";
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

function readToolFromSearch(search: string): VisualToolsTab {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const tool = params.get("tool");
  if (tool === "translate" || tool === "generate") return tool;
  const legacyTab = params.get("tab");
  return legacyTab === "translate" ? "translate" : "generate";
}

function readNavTabFromSearch(search: string): StudioNavTab {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (params.get("view") === "tasks") return "tasks";
  return readToolFromSearch(search);
}

function syncInternalSearch(next: { navTab: StudioNavTab; fallbackTool?: VisualToolsTab }) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const tool = next.navTab === "tasks" ? (next.fallbackTool ?? readToolFromSearch(url.search)) : next.navTab;
  url.searchParams.set("tool", tool);
  url.searchParams.delete("tab");
  if (next.navTab === "tasks") {
    url.searchParams.set("view", "tasks");
  } else {
    url.searchParams.delete("view");
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
  navTab: StudioNavTab;
  setNavTab: (tab: StudioNavTab) => void;
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
  navTab,
  setNavTab,
  locationSearch,
  onTaskCreated,
  onTaskDeleted,
  onTaskUpdated,
}: InnerProps) {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const pictureTranslate = usePictureTranslateContext();
  const [generateConfirmOpen, setGenerateConfirmOpen] = useState(false);
  const [translateConfirmOpen, setTranslateConfirmOpen] = useState(false);

  const toastShow = useCallback(
    (message: string) => shopify.toast.show(message),
    [shopify],
  );

  const imageGen = useImageGeneration({
    locationSearch,
    toastShow,
    onTaskCreated,
  });

  const runningCount = tasks.filter((t) => t.status === "running").length;
  const sectionSubtitle =
    navTab === "translate"
      ? t("pictureTranslate.pageSubtitle")
      : navTab === "generate"
        ? t("imageGeneration.pageSubtitle")
        : t("imageStudio.tasksPageSubtitle");

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
          activeTab={navTab}
          onTabChange={setNavTab}
          ariaLabel={t("imageStudio.pageNavAriaLabel")}
          items={[
            { key: "generate", label: t("imageStudio.tabGenerate") },
            { key: "translate", label: t("imageStudio.tabTranslate") },
            { key: "tasks", label: t("imageStudio.tabsTasks"), badgeCount: runningCount },
          ]}
          style={{ margin: "0 0 20px" }}
        />

        {navTab !== "tasks" && (
          <>
            <div style={{ marginTop: 16 }}>
              <PageSurface
                title={
                  navTab === "translate"
                    ? t("pictureTranslate.sectionConfig")
                    : t("imageGeneration.sectionConfig")
                }
                subtitle={sectionSubtitle}
              >
                {navTab === "generate" ? (
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

        {navTab === "tasks" && (
          <ImageStudioTaskListPage
            tasks={tasks}
            locationSearch={locationSearch}
            onTaskDeleted={onTaskDeleted}
            onTaskUpdated={onTaskUpdated}
            onTaskCreated={onTaskCreated}
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
                setNavTab("tasks");
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
                setNavTab("tasks");
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
  const location = useLocation();
  const locationSearch =
    typeof window !== "undefined" ? window.location.search : "";

  const [tasks, setTasks] = useState<AITaskItem[]>(() => [
    ...loaderData.imageGenTasks,
    ...loaderData.translateTasks,
  ]);
  const [navTab, setNavTabState] = useState<StudioNavTab>(() =>
    readNavTabFromSearch(typeof window !== "undefined" ? window.location.search : location.search),
  );
  const [lastToolTab, setLastToolTab] = useState<VisualToolsTab>(() =>
    readToolFromSearch(typeof window !== "undefined" ? window.location.search : location.search),
  );

  useEffect(() => {
    const nextNavTab = readNavTabFromSearch(location.search);
    setNavTabState(nextNavTab);
    setLastToolTab(readToolFromSearch(location.search));
  }, [location.search]);

  const setNavTab = useCallback((tab: StudioNavTab) => {
    setNavTabState(tab);
    const nextTool = tab === "tasks" ? lastToolTab : tab;
    if (tab !== "tasks") {
      setLastToolTab(tab);
    }
    syncInternalSearch({
      navTab: tab,
      fallbackTool: nextTool,
    });
  }, [lastToolTab]);

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
      setNavTab("tasks");
    },
    [setNavTab],
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

      if (status === "running") return;

      void (async () => {
        try {
          const params = new URLSearchParams(
            location.search.startsWith("?") ? location.search.slice(1) : location.search,
          );
          params.set("taskId", taskId);
          const resp = await fetch(`/api/ai-task-detail?${params.toString()}`);
          if (!resp.ok) return;
          const body = (await resp.json()) as { task?: AITaskItem };
          if (!body.task) return;
          setTasks((prev) => prev.map((task) => (task.id === taskId ? body.task! : task)));
        } catch {
          // ignore; user can refresh manually
        }
      })();
    },
    [location.search],
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
        navTab={navTab}
        setNavTab={setNavTab}
        locationSearch={locationSearch}
        onTaskCreated={handleTaskCreated}
        onTaskDeleted={handleTaskDeleted}
        onTaskUpdated={handleTaskUpdated}
      />
    </PictureTranslateProvider>
  );
}
