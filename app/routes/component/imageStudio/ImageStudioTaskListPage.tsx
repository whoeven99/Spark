import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens, pageEmptyStateStyle } from "../../page/pageUiStyles";
import { AITaskPagination } from "../aiTask/AITaskPagination";
import type {
  AITaskItem,
  AITaskListMetrics,
  AITaskListPageData,
  AITaskStatus,
  AITaskType,
} from "../../../lib/aiTaskTypes";
import { ImageGenerationTaskCard } from "./ImageGenerationTaskCard";
import { PictureTranslateTaskCard } from "./PictureTranslateTaskCard";
import { ImageStudioTaskDetailRouter } from "./ImageStudioTaskDetailRouter";

type TaskViewTab = "current" | "history";
const EMPTY_STATE_MIN_HEIGHT = 320;

function getCacheKey(view: TaskViewTab, page: number): string {
  return `${view}:${page}`;
}

function readTaskViewFromSearch(search: string, fallback: TaskViewTab): TaskViewTab {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("taskView") === "history" ? "history" : fallback;
}

function readTaskPageFromSearch(search: string): number {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const raw = Number(params.get("taskPage"));
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.floor(raw);
}

function syncTaskListSearch(view: TaskViewTab, page: number) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("taskView", view);
  if (page <= 1) {
    url.searchParams.delete("taskPage");
  } else {
    url.searchParams.set("taskPage", String(page));
  }
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

type Props = {
  initialPageData: AITaskListPageData;
  tasks: AITaskItem[];
  taskMetrics: AITaskListMetrics;
  locationSearch: string;
  onTaskDeleted: (task: AITaskItem) => void;
  onTaskUpdated?: (taskId: string, status: AITaskStatus, result?: Record<string, unknown>) => void;
  onTaskCreated?: (
    taskId: string,
    batchId: string,
    taskType: AITaskType,
    optimisticConfig?: Record<string, unknown>,
  ) => void;
};

async function fetchImageStudioTaskPage(params: {
  locationSearch: string;
  view: TaskViewTab;
  page: number;
}): Promise<AITaskListPageData> {
  const query = new URLSearchParams(
    params.locationSearch.startsWith("?") ? params.locationSearch.slice(1) : params.locationSearch,
  );
  query.set("view", params.view);
  query.set("page", String(params.page));
  query.append("taskType", "image_generation");
  query.append("taskType", "picture_translate");

  const response = await fetch(`/api/ai-task-list?${query.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to load task list: ${response.status}`);
  }
  return (await response.json()) as AITaskListPageData;
}

export function ImageStudioTaskListPage({
  initialPageData,
  tasks,
  taskMetrics,
  locationSearch,
  onTaskDeleted,
  onTaskUpdated,
  onTaskCreated,
}: Props) {
  const { t } = useTranslation();
  const initialViewTab = readTaskViewFromSearch(
    typeof window !== "undefined" ? window.location.search : locationSearch,
    initialPageData.view,
  );
  const initialTaskPage = readTaskPageFromSearch(
    typeof window !== "undefined" ? window.location.search : locationSearch,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<TaskViewTab>(initialViewTab);
  const [currentPage, setCurrentPage] = useState<number>(
    initialViewTab === initialPageData.view ? initialTaskPage : 1,
  );
  const [loadedPageData, setLoadedPageData] = useState<AITaskListPageData>(initialPageData);
  const [pageCache, setPageCache] = useState<Record<string, AITaskListPageData>>({
    [getCacheKey(initialPageData.view, initialPageData.page)]: initialPageData,
  });
  const [loading, setLoading] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const pageSize = loadedPageData.pageSize || initialPageData.pageSize;
  const listTopRef = useRef<HTMLDivElement | null>(null);

  function scrollListToTop() {
    if (typeof window === "undefined") return;
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    if (viewTab !== "current" || currentPage !== 1) return;
    setLoadedPageData((prev) => {
      const nextPageData = {
        ...prev,
        tasks,
        view: "current" as const,
        page: 1,
        totalCount: taskMetrics.currentCount,
        totalPages: Math.max(1, Math.ceil(taskMetrics.currentCount / initialPageData.pageSize)),
        metrics: taskMetrics,
      };
      setPageCache((cache) => ({
        ...cache,
        [getCacheKey("current", 1)]: nextPageData,
      }));
      return nextPageData;
    });
  }, [currentPage, initialPageData.pageSize, taskMetrics, tasks, viewTab]);

  useEffect(() => {
    syncTaskListSearch(viewTab, currentPage);
  }, [currentPage, viewTab]);

  useEffect(() => {
    if (selectedTaskId) return;
    const cacheKey = getCacheKey(viewTab, currentPage);
    const cachedPage = pageCache[cacheKey];
    if (cachedPage) {
      setLoadedPageData(cachedPage);
      setLoading(false);
      return;
    }
    if (viewTab === "current" && currentPage === 1) return;

    let cancelled = false;
    setLoading(true);

    void fetchImageStudioTaskPage({
      locationSearch,
      view: viewTab,
      page: currentPage,
    })
      .then((data) => {
        if (cancelled) return;
        setLoadedPageData(data);
        setPageCache((prev) => ({
          ...prev,
          [cacheKey]: data,
        }));
      })
      .catch(() => {
        if (cancelled) return;
        const fallbackPageData = {
          tasks: [],
          view: viewTab,
          page: currentPage,
          totalCount: viewTab === "current" ? taskMetrics.currentCount : taskMetrics.historyCount,
          totalPages: Math.max(
            1,
            Math.ceil(
              (viewTab === "current" ? taskMetrics.currentCount : taskMetrics.historyCount) /
                pageSize,
            ),
          ),
          pageSize,
          metrics: taskMetrics,
        };
        setLoadedPageData(fallbackPageData);
        setPageCache((prev) => ({
          ...prev,
          [cacheKey]: fallbackPageData,
        }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentPage, locationSearch, pageCache, pageSize, selectedTaskId, taskMetrics, viewTab]);

  const hasResolvedPageData =
    (viewTab === "current" && currentPage === 1) ||
    (loadedPageData.view === viewTab && loadedPageData.page === currentPage);

  const visibleTasks = useMemo(() => {
    if (viewTab === "current" && currentPage === 1) {
      return tasks;
    }
    if (loadedPageData.view === viewTab && loadedPageData.page === currentPage) {
      return loadedPageData.tasks;
    }
    return [];
  }, [currentPage, loadedPageData.page, loadedPageData.tasks, loadedPageData.view, tasks, viewTab]);

  const totalCount = viewTab === "current" ? taskMetrics.currentCount : taskMetrics.historyCount;
  const totalPages =
    viewTab === "current" && currentPage === 1
      ? Math.max(1, Math.ceil(taskMetrics.currentCount / initialPageData.pageSize))
      : loadedPageData.view === viewTab && loadedPageData.page === currentPage
        ? loadedPageData.totalPages
        : Math.max(1, Math.ceil(totalCount / initialPageData.pageSize));

  async function handleDelete(task: AITaskItem) {
    setDeletingId(task.id);
    try {
      const resp = await fetch(`/api/ai-task${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", taskId: task.id }),
      });
      if (resp.ok) {
        if (!(viewTab === "current" && currentPage === 1)) {
          setLoadedPageData((prev) => ({
            ...prev,
            tasks: prev.tasks.filter((item) => item.id !== task.id),
            totalCount: Math.max(prev.totalCount - 1, 0),
            totalPages: Math.max(1, Math.ceil(Math.max(prev.totalCount - 1, 0) / prev.pageSize)),
          }));
        }
        setSelectedTaskId((prev) => (prev === task.id ? null : prev));
        onTaskDeleted(task);
        if (visibleTasks.length === 1 && currentPage > 1) {
          setCurrentPage((prev) => prev - 1);
        }
      }
    } finally {
      setDeletingId(null);
    }
  }
  const selectedTask = selectedTaskId ? visibleTasks.find((task) => task.id === selectedTaskId) ?? null : null;

  function handleViewChange(nextView: TaskViewTab) {
    if (nextView === viewTab) return;
    const nextPage = 1;
    if (!pageCache[getCacheKey(nextView, nextPage)]) {
      setLoading(true);
    }
    setViewTab(nextView);
    setCurrentPage(nextPage);
    scrollListToTop();
  }

  function handlePageChange(nextPage: number) {
    if (nextPage === currentPage) return;
    if (!pageCache[getCacheKey(viewTab, nextPage)]) {
      setLoading(true);
    }
    setCurrentPage(nextPage);
    scrollListToTop();
  }

  if (selectedTask) {
    return (
      <ImageStudioTaskDetailRouter
        task={selectedTask}
        locationSearch={locationSearch}
        onBack={() => setSelectedTaskId(null)}
        onTaskUpdated={onTaskUpdated}
        onTaskCreated={onTaskCreated}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div ref={listTopRef} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          padding: "0.5rem",
          borderRadius: 999,
          background: pageColorTokens.surfaceMuted,
          border: `1px solid ${pageColorTokens.borderSubtle}`,
        }}
      >
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            {
              key: "current" as const,
              label: t("imageStudio.currentTasksTab", { count: taskMetrics.currentCount }),
            },
            {
              key: "history" as const,
              label: t("imageStudio.historyTasksTab", { count: taskMetrics.historyCount }),
            },
          ].map((tab) => {
            const active = viewTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleViewChange(tab.key)}
                style={{
                  padding: "0.5rem 0.9rem",
                  borderRadius: 999,
                  border: `1px solid ${active ? pageColorTokens.borderSubtle : "transparent"}`,
                  background: active ? pageColorTokens.surface : "transparent",
                  color: active ? pageColorTokens.textPrimary : pageColorTokens.textSecondary,
                  boxShadow: active ? pageColorTokens.shadowCard : "none",
                  fontSize: 13,
                  fontWeight: active ? 700 : 600,
                  cursor: "pointer",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
          {t("imageStudio.historyTasksHint")}
        </div>
      </div>

      {loading && !hasResolvedPageData && totalCount > 0 ? (
        <div style={{ ...pageEmptyStateStyle, minHeight: EMPTY_STATE_MIN_HEIGHT }}>
          <span style={{ fontSize: 28, lineHeight: 1 }}>⏳</span>
          <span>{t("common.loading")}</span>
        </div>
      ) : visibleTasks.length === 0 ? (
        <div style={{ ...pageEmptyStateStyle, minHeight: EMPTY_STATE_MIN_HEIGHT }}>
          <span style={{ fontSize: 28, lineHeight: 1 }}>🖼️</span>
          <span>
            {viewTab === "current"
              ? t("imageStudio.currentTasksEmpty")
              : t("imageStudio.historyTasksEmpty")}
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visibleTasks.map((task) =>
            task.taskType === "image_generation" ? (
              <ImageGenerationTaskCard
                key={task.id}
                task={task}
                locationSearch={locationSearch}
                onDelete={() => void handleDelete(task)}
                onOpenDetail={() => setSelectedTaskId(task.id)}
                onTaskUpdated={onTaskUpdated}
                deleting={deletingId === task.id}
              />
            ) : (
              <PictureTranslateTaskCard
                key={task.id}
                task={task}
                locationSearch={locationSearch}
                onDelete={() => void handleDelete(task)}
                onOpenDetail={() => setSelectedTaskId(task.id)}
                onTaskUpdated={onTaskUpdated}
                deleting={deletingId === task.id}
              />
            ),
          )}
        </div>
      )}
      <AITaskPagination
        page={currentPage}
        totalPages={totalPages}
        totalCount={totalCount}
        loading={loading}
        onPageChange={handlePageChange}
      />
    </div>
  );
}
