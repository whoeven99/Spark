import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens, pageEmptyStateStyle } from "../../page/pageUiStyles";
import { AITaskPagination } from "../aiTask/AITaskPagination";
import { ProductImproveTaskCard } from "./ProductImproveTaskCard";
import { ProductImproveTaskDetailPage } from "./ProductImproveTaskDetailPage";
import type {
  AITaskItem,
  AITaskListMetrics,
  AITaskListPageData,
  AITaskStatus,
} from "../../../lib/aiTaskTypes";

type TaskViewTab = "current" | "history";
const EMPTY_STATE_MIN_HEIGHT = 320;

type Props = {
  initialPageData: AITaskListPageData;
  tasks: AITaskItem[];
  taskMetrics: AITaskListMetrics;
  locationSearch: string;
  onTaskDeleted: (task: AITaskItem) => void;
  onTaskUpdated?: (taskId: string, status: AITaskStatus, result?: Record<string, unknown>) => void;
};

async function fetchProductImproveTaskPage(params: {
  locationSearch: string;
  view: TaskViewTab;
  page: number;
}): Promise<AITaskListPageData> {
  const query = new URLSearchParams(
    params.locationSearch.startsWith("?") ? params.locationSearch.slice(1) : params.locationSearch,
  );
  query.set("view", params.view);
  query.set("page", String(params.page));
  query.append("taskType", "product_improve");

  const response = await fetch(`/api/ai-task-list?${query.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to load task list: ${response.status}`);
  }
  return (await response.json()) as AITaskListPageData;
}

export function ProductImproveTaskListPage({
  initialPageData,
  tasks,
  taskMetrics,
  locationSearch,
  onTaskDeleted,
  onTaskUpdated,
}: Props) {
  const { t } = useTranslation();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<TaskViewTab>(initialPageData.view);
  const [currentPage, setCurrentPage] = useState<number>(initialPageData.page);
  const [loadedPageData, setLoadedPageData] = useState<AITaskListPageData>(initialPageData);
  const [loading, setLoading] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (viewTab !== "current" || currentPage !== 1) return;
    setLoadedPageData((prev) => ({
      ...prev,
      tasks,
      view: "current",
      page: 1,
      totalCount: taskMetrics.currentCount,
      totalPages: Math.max(1, Math.ceil(taskMetrics.currentCount / prev.pageSize)),
      metrics: taskMetrics,
    }));
  }, [currentPage, taskMetrics, tasks, viewTab]);

  useEffect(() => {
    if (selectedTaskId) return;
    if (viewTab === "current" && currentPage === 1) return;

    let cancelled = false;
    setLoading(true);

    void fetchProductImproveTaskPage({
      locationSearch,
      view: viewTab,
      page: currentPage,
    })
      .then((data) => {
        if (cancelled) return;
        setLoadedPageData(data);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadedPageData((prev) => ({
          ...prev,
          tasks: [],
          view: viewTab,
          page: currentPage,
          totalCount: viewTab === "current" ? taskMetrics.currentCount : taskMetrics.historyCount,
          totalPages: Math.max(
            1,
            Math.ceil(
              (viewTab === "current" ? taskMetrics.currentCount : taskMetrics.historyCount) /
                prev.pageSize,
            ),
          ),
          metrics: taskMetrics,
        }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentPage, locationSearch, selectedTaskId, taskMetrics, viewTab]);

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

  const selectedTask = selectedTaskId
    ? visibleTasks.find((task) => task.id === selectedTaskId) ?? null
    : null;

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {selectedTask ? (
        <ProductImproveTaskDetailPage
          task={selectedTask}
          locationSearch={locationSearch}
          onBack={() => setSelectedTaskId(null)}
          onTaskUpdated={onTaskUpdated}
        />
      ) : visibleTasks.length === 0 ? (
        <>
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
                  label: t("productImproveStage1.currentTasksTab", { count: taskMetrics.currentCount }),
                },
                {
                  key: "history" as const,
                  label: t("productImproveStage1.historyTasksTab", { count: taskMetrics.historyCount }),
                },
              ].map((tab) => {
                const active = viewTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setViewTab(tab.key);
                      setCurrentPage(1);
                    }}
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
              {t("productImproveStage1.historyTasksHint")}
            </div>
          </div>

          <div
            style={{
              ...pageEmptyStateStyle,
              minHeight: EMPTY_STATE_MIN_HEIGHT,
              padding: "2.75rem 1.5rem",
              background: "linear-gradient(160deg, #fafafa 0%, #f5f6f8 100%)",
              border: `1px dashed ${pageColorTokens.borderSubtle}`,
            }}
          >
            <span style={{ fontSize: 28, lineHeight: 1 }}>📋</span>
            <span style={{ fontSize: 14, color: pageColorTokens.textSecondary }}>
              {viewTab === "current"
                ? t("productImproveStage1.currentTasksEmpty")
                : t("productImproveStage1.historyTasksEmpty")}
            </span>
          </div>
          <AITaskPagination
            page={currentPage}
            totalPages={totalPages}
            totalCount={totalCount}
            loading={loading}
            onPageChange={setCurrentPage}
          />
        </>
      ) : (
        <>
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
                  label: t("productImproveStage1.currentTasksTab", { count: taskMetrics.currentCount }),
                },
                {
                  key: "history" as const,
                  label: t("productImproveStage1.historyTasksTab", { count: taskMetrics.historyCount }),
                },
              ].map((tab) => {
                const active = viewTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setViewTab(tab.key);
                      setCurrentPage(1);
                    }}
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
              {t("productImproveStage1.historyTasksHint")}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {visibleTasks.map((task) => (
              <ProductImproveTaskCard
                key={task.id}
                task={task}
                locationSearch={locationSearch}
                onDelete={() => void handleDelete(task)}
                onOpenDetail={() => setSelectedTaskId(task.id)}
                onTaskUpdated={onTaskUpdated}
                deleting={deletingId === task.id}
              />
            ))}
          </div>
          <AITaskPagination
            page={currentPage}
            totalPages={totalPages}
            totalCount={totalCount}
            loading={loading}
            onPageChange={setCurrentPage}
          />
        </>
      )}
    </div>
  );
}
