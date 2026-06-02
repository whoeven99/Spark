import { useAppBridge } from "@shopify/app-bridge-react";
import { useCallback, useState } from "react";
import { useLoaderData, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useImageGeneration } from "../../hooks/useImageGeneration";
import type { AITaskItem, AITaskType } from "../../lib/aiTaskTypes";
import type { ImageStudioPageLoaderData } from "../../server/visualTools/imageStudioPageLoader.server";
import { ImageGenerationForm } from "../component/imageGeneration/ImageGenerationForm";
import { PictureTranslateForm } from "../component/pictureTranslate/PictureTranslateForm";
import { PictureTranslateProvider } from "../component/pictureTranslate/pictureTranslateContext";
import { SegmentedPageTabs } from "../component/shared/SegmentedPageTabs";
import type { VisualToolsTab } from "../component/visualTools/VisualToolsTabBar";
import { VisualToolsTabBar } from "../component/visualTools/VisualToolsTabBar";
import { TaskListPage } from "../component/aiTask/TaskListPage";
import { TaskListSummary } from "../component/aiTask/TaskListSummary";
import {
  PageSectionHeader,
  PageSurface,
  pageColorTokens,
  pageContentStyle,
  pageTrustFootnoteStyle,
} from "./pageUiStyles";

type PageTab = "config" | "tasks";

function parseToolTab(value: string | null): VisualToolsTab {
  return value === "translate" ? "translate" : "generate";
}

type InnerProps = {
  tasks: AITaskItem[];
  pageTab: PageTab;
  setPageTab: (tab: PageTab) => void;
  locationSearch: string;
  onTaskCreated: (taskId: string, batchId: string, taskType: AITaskType) => void;
  onTaskDeleted: (taskId: string) => void;
};

function ImageStudioPageInner({
  tasks,
  pageTab,
  setPageTab,
  locationSearch,
  onTaskCreated,
  onTaskDeleted,
}: InnerProps) {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeToolTab = parseToolTab(searchParams.get("tab"));

  const setActiveToolTab = useCallback(
    (tab: VisualToolsTab) => {
      const next = new URLSearchParams(searchParams);
      next.set("tab", tab);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
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

  const runningCount = tasks.filter((t) => t.status === "running").length;
  const sectionSubtitle =
    activeToolTab === "translate"
      ? t("pictureTranslate.pageSubtitle")
      : t("imageGeneration.pageSubtitle");

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
          ariaLabel="图片工具页面导航"
          items={[
            { key: "config", label: "配置页" },
            { key: "tasks", label: "任务页", badgeCount: runningCount },
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
                    onGenerateImage={() => void imageGen.submitGenerate()}
                  />
                ) : (
                  <PictureTranslateForm variant="page" />
                )}
              </PageSurface>
            </div>
          </>
        )}

        {pageTab === "tasks" && (
          <TaskListPage
            tasks={tasks}
            locationSearch={locationSearch}
            onTaskDeleted={onTaskDeleted}
          />
        )}

        <p style={pageTrustFootnoteStyle}>
          {activeToolTab === "translate"
            ? t("pictureTranslate.pageFootnote")
            : t("imageGeneration.pageFootnote")}
        </p>
      </div>
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
  const [pageTab, setPageTab] = useState<PageTab>("config");

  const handleTaskCreated = useCallback(
    (taskId: string, batchId: string, taskType: AITaskType = "image_generation") => {
      const now = new Date().toISOString();
      const optimisticTask: AITaskItem = {
        id: taskId,
        batchId,
        shop: "",
        appName: "",
        taskType,
        status: "running",
        config: {},
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
    },
    [],
  );

  const handleTaskDeleted = useCallback((taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

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
      />
    </PictureTranslateProvider>
  );
}
