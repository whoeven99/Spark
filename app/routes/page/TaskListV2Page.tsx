import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Empty, Select, Spin } from "antd";
import { useTranslation } from "react-i18next";
import { useEmbeddedLocationSearch } from "../../hooks/useEmbeddedLocationSearch";
import { useEmbeddedNavigate } from "../../hooks/useEmbeddedNavigate";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { useFeatureView } from "../../lib/featureTrack";
import type { AITaskStatus } from "../../lib/aiTaskTypes";
import type {
  UnifiedTaskEntry,
  UnifiedTaskListResponse,
  UnifiedTaskStatusFilter,
  UnifiedTaskTypeFilter,
} from "../../lib/unifiedTaskTypes";
import { buildWorkspaceChatPrefillPath } from "../../lib/workspaceChatPrefill";
import { AITaskPagination } from "../component/aiTask/AITaskPagination";
import { TaskDetailDialog } from "../component/taskListV2/TaskDetailDialog";
import { TaskRowItem } from "../component/taskListV2/TaskRowItem";
import { buildTaskRow, sortTaskRowsByTimeDesc } from "../component/taskListV2/taskRowModel";
import {
  PageHeaderNav,
  PageSurface,
  mobilePageContentStyle,
  pageColorTokens,
  pageContentStyle,
} from "./pageUiStyles";

const PAGE_SIZE = 12;
const RUNNING_POLL_INTERVAL_MS = 5000;
const CACHE_FRESH_MS = 15_000;

type TaskListQuery = {
  page: number;
  typeFilter: UnifiedTaskTypeFilter;
  statusFilter: UnifiedTaskStatusFilter;
};

type CachedTaskPage = {
  data: UnifiedTaskListResponse;
  fetchedAt: number;
};

function cacheKey(query: TaskListQuery): string {
  return `${query.page}|${query.typeFilter}|${query.statusFilter}`;
}

const TYPE_FILTERS: readonly UnifiedTaskTypeFilter[] = [
  "all",
  "product_improve",
  "image_generation",
  "picture_translate",
];

const STATUS_FILTERS: readonly UnifiedTaskStatusFilter[] = [
  "all",
  "running",
  "needs_review",
  "completed",
  "failed",
];

async function fetchTasks(params: {
  locationSearch: string;
  page: number;
  typeFilter: UnifiedTaskTypeFilter;
  statusFilter: UnifiedTaskStatusFilter;
}): Promise<UnifiedTaskListResponse> {
  const query = new URLSearchParams(
    params.locationSearch.startsWith("?")
      ? params.locationSearch.slice(1)
      : params.locationSearch,
  );
  query.set("view", "all");
  query.set("include", "ai");
  query.set("page", String(params.page));
  query.set("pageSize", String(PAGE_SIZE));
  query.set("type", params.typeFilter);
  query.set("status", params.statusFilter);
  query.set("sort", "time_desc");

  const response = await fetch(`/api/unified-tasks?${query.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Failed to fetch tasks: ${response.status}`);
  return (await response.json()) as UnifiedTaskListResponse;
}

export function TaskListV2Page() {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const locationSearch = useEmbeddedLocationSearch();
  const navigate = useEmbeddedNavigate();
  useFeatureView("tasks-v2");

  const [typeFilter, setTypeFilter] = useState<UnifiedTaskTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<UnifiedTaskStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<UnifiedTaskEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const requestIdRef = useRef(0);
  const pageCacheRef = useRef(new Map<string, CachedTaskPage>());
  const inflightRef = useRef(new Map<string, Promise<UnifiedTaskListResponse>>());

  const query = useMemo<TaskListQuery>(
    () => ({ page, typeFilter, statusFilter }),
    [page, statusFilter, typeFilter],
  );

  useEffect(() => {
    setHydrated(true);
  }, []);

  const applyPageData = useCallback((data: UnifiedTaskListResponse) => {
    setEntries(data.entries);
    setTotalCount(data.totalCount);
    setTotalPages(data.totalPages);
    setLoadFailed(false);
  }, []);

  const writeCache = useCallback((target: TaskListQuery, data: UnifiedTaskListResponse) => {
    pageCacheRef.current.set(cacheKey(target), { data, fetchedAt: Date.now() });
  }, []);

  const requestPage = useCallback(
    (target: TaskListQuery, force = false): Promise<UnifiedTaskListResponse> => {
      const key = cacheKey(target);
      const cached = pageCacheRef.current.get(key);
      if (!force && cached && Date.now() - cached.fetchedAt < CACHE_FRESH_MS) {
        return Promise.resolve(cached.data);
      }
      const inflight = inflightRef.current.get(key);
      if (inflight) return inflight;
      const request = fetchTasks({ locationSearch, ...target })
        .then((data) => {
          writeCache(target, data);
          return data;
        })
        .finally(() => {
          inflightRef.current.delete(key);
        });
      inflightRef.current.set(key, request);
      return request;
    },
    [locationSearch, writeCache],
  );

  const load = useCallback(
    async (silent: boolean) => {
      const requestId = ++requestIdRef.current;
      const cached = pageCacheRef.current.get(cacheKey(query));

      if (cached) {
        applyPageData(cached.data);
        setLoading(false);
      } else if (!silent) {
        setLoading(true);
      }

      try {
        const data = await requestPage(query, silent);
        if (requestId !== requestIdRef.current) return;
        applyPageData(data);
      } catch {
        if (requestId !== requestIdRef.current) return;
        if (!cached) setLoadFailed(true);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [applyPageData, query, requestPage],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const rows = useMemo(
    () => sortTaskRowsByTimeDesc(entries.map((entry) => buildTaskRow(entry, t))),
    [entries, t],
  );

  const hasRunningTask = useMemo(
    () =>
      entries.some(
        (entry) => entry.entryType === "ai_task" && entry.task.status === "running",
      ),
    [entries],
  );

  useEffect(() => {
    if (!hasRunningTask) return;
    const timer = window.setInterval(() => {
      void load(true);
    }, RUNNING_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [hasRunningTask, load]);

  const detailTask = useMemo(() => {
    if (!detailTaskId) return null;
    const entry = entries.find(
      (item): item is Extract<UnifiedTaskEntry, { entryType: "ai_task" }> =>
        item.entryType === "ai_task" && item.task.id === detailTaskId,
    );
    return entry?.task ?? null;
  }, [detailTaskId, entries]);

  const handleTaskUpdated = useCallback(
    (taskId: string, status: AITaskStatus, result?: Record<string, unknown>) => {
      const patchEntries = (list: UnifiedTaskEntry[]) =>
        list.map((entry) =>
          entry.entryType === "ai_task" && entry.task.id === taskId
            ? { ...entry, task: { ...entry.task, status, ...(result ? { result } : {}) } }
            : entry,
        );
      setEntries((prev) => patchEntries(prev));
      for (const [key, cached] of pageCacheRef.current) {
        pageCacheRef.current.set(key, {
          ...cached,
          data: { ...cached.data, entries: patchEntries(cached.data.entries) },
        });
      }
    },
    [],
  );

  const handleChatAction = useCallback(
    (prompt: string) => {
      void navigate(buildWorkspaceChatPrefillPath({ prompt }));
    },
    [navigate],
  );

  function resetToFirstPage<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <PageHeaderNav
        title={t("tasksV2.title")}
        titleBarTitle={t("nav.tasksV2")}
        backLabel={t("common.backToPrevious")}
        fallbackPath="/app"
        rightAction={
          <div className="flex flex-wrap items-center gap-3">
            <Select
              className="min-w-[140px]"
              value={typeFilter}
              onChange={resetToFirstPage(setTypeFilter)}
              options={TYPE_FILTERS.map((key) => ({
                value: key,
                label: t(`tasksV2.filter.type.${key}`),
              }))}
            />
            <Select
              className="min-w-[128px]"
              value={statusFilter}
              onChange={resetToFirstPage(setStatusFilter)}
              options={STATUS_FILTERS.map((key) => ({
                value: key,
                label: t(`tasksV2.filter.status.${key}`),
              }))}
            />
            <span className="text-sm" style={{ color: pageColorTokens.textFootnote }}>
              {t("tasksV2.resultCount", { count: totalCount })}
            </span>
          </div>
        }
      />

      <PageSurface>
        <div className="flex flex-col">
          {loading && rows.length === 0 ? (
            <div className="flex min-h-56 items-center justify-center">
              <Spin />
            </div>
          ) : rows.length === 0 ? (
            <Empty
              className="spark-ant-empty py-12"
              description={loadFailed ? t("tasksV2.loadFailed") : t("tasksV2.empty")}
            />
          ) : (
            <div>
              {rows.map((row, index) => (
                <TaskRowItem
                  key={row.key}
                  row={row}
                  hydrated={hydrated}
                  showTopBorder={index > 0}
                  onDetail={setDetailTaskId}
                  onChat={handleChatAction}
                />
              ))}
            </div>
          )}
        </div>
      </PageSurface>

      <AITaskPagination
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        loading={loading}
        onPageChange={setPage}
      />

      <TaskDetailDialog
        task={detailTask}
        locationSearch={locationSearch}
        onClose={() => setDetailTaskId(null)}
        onTaskUpdated={handleTaskUpdated}
      />
    </div>
  );
}
